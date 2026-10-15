import { z } from 'zod';
import { Actor } from '../core/contracts';
import { AppError,audit,pool,requireRole,tenantTransaction } from './db';
import { IntegrationError } from './integrations/http';
export const Provider=z.enum(['google_ads','hubspot','ga4','warehouse','models']);
export type Provider=z.infer<typeof Provider>;
export async function enqueueSync(actor:Actor,customerId:string,provider:Provider){
 requireRole(actor,['owner','analyst']);z.string().regex(/^\d{10}$/).parse(customerId);Provider.parse(provider);
 return tenantTransaction(actor,async c=>{
  if(!(await c.query('SELECT id FROM ad_accounts WHERE customer_id=$1',[customerId])).rowCount)throw new AppError(404,'Account not found');
  const key=`sync:${provider}:${customerId}:${Math.floor(Date.now()/60000)}`;
  const id=crypto.randomUUID();await c.query('INSERT INTO integration_jobs(tenant_id,id,customer_id,provider,idempotency_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,idempotency_key) DO NOTHING',[actor.tenantId,id,customerId,provider,key]);
  const job=(await c.query('SELECT id,status FROM integration_jobs WHERE idempotency_key=$1',[key])).rows[0];
  await audit(c,actor,'integration.queued',job.id,{provider,customerId});return job;
 });
}
export async function runIntegrationJob(actor:Actor,handlers:Partial<Record<Provider,(customerId:string,key:string)=>Promise<unknown>>>){
 const lockClient=await pool().connect();let key:string|null=null;
 try{
  const job=await tenantTransaction(actor,async c=>{
   const row=(await c.query("SELECT * FROM integration_jobs WHERE (status='queued' AND available_at<=now()) OR (status='running' AND lease_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];if(!row)return null;
   key=`integration:${actor.tenantId}:${row.provider}:${row.customer_id}`;
   if(!(await lockClient.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[key])).rows[0].locked){key=null;return null;}
   const lease=crypto.randomUUID();await c.query("UPDATE integration_jobs SET status='running',attempt_count=attempt_count+1,lease_owner=$1,lease_until=now()+interval '10 minutes' WHERE id=$2",[lease,row.id]);return {...row,lease_owner:lease,attempt_count:row.attempt_count+1};
  });
  if(!job)return null;
  const handler=handlers[Provider.parse(job.provider)];let result:unknown,status:'completed'|'queued'|'failed'='completed',delay=0;
  try{if(!handler)throw new Error('Provider configuration missing');result=await handler(job.customer_id,job.idempotency_key);}
  catch(error){status=error instanceof IntegrationError&&error.retryable&&job.attempt_count<3?'queued':'failed';delay=Math.max(2**job.attempt_count,error instanceof IntegrationError?error.retryAfterSeconds??0:0);result={error:'Integration failed; check configuration and provider status',retryable:status==='queued'};}
  await tenantTransaction(actor,async c=>{
   const changed=await c.query("UPDATE integration_jobs SET status=$1,result=$2,lease_owner=NULL,lease_until=NULL,available_at=now()+($3*interval '1 second') WHERE id=$4 AND lease_owner=$5 RETURNING id",[status,result??{},delay,job.id,job.lease_owner]);if(!changed.rowCount)throw new Error('Integration lease lost');
   await audit(c,actor,`integration.${status}`,job.id,{provider:job.provider,customerId:job.customer_id,attempt:job.attempt_count});
   if(status==='failed')await c.query('INSERT INTO alerts(tenant_id,id,customer_id,severity,message) VALUES($1,$2,$3,$4,$5)',[actor.tenantId,crypto.randomUUID(),job.customer_id,'warning',`${job.provider} synchronization failed; inspect configuration and source status`]);
  });return {id:job.id,status};
 }finally{let dead=false;if(key)try{await lockClient.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[key]);}catch{lockClient.release(true);dead=true;}if(!dead)lockClient.release();}
}
