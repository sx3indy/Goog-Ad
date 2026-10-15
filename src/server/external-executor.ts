import { PoolClient } from 'pg';
import { Actor, CampaignState, Proposal, ProposalSchema } from '../core/contracts';
import { evaluatePolicy } from '../core/policy';
import { AdsAdapter } from './ads-adapter';
import { audit,pool } from './db';
import { accountPolicy,evidenceSnapshots } from './service';
import { IntegrationError } from './integrations/http';

type Claimed={id:string;proposal_id:string;proposal:Proposal;resource_name:string;lease_owner:string;attempt_count:number;ever_dispatched:boolean};
const matches=(state:CampaignState,after:Record<string,unknown>)=>Object.entries(after).every(([k,v])=>(state as unknown as Record<string,unknown>)[k]===v);
/** External I/O occurs outside SQL transactions; session locks serialize resource writes. */
export async function runExternal(actor:Actor,adapter:AdsAdapter,apiVersion:string){
 if(adapter.mode!=='live')throw new Error('External executor requires a live adapter');
 const c=await pool().connect();let resourceLock:string|null=null;let claim:Claimed|null=null;
 async function tx<T>(fn:()=>Promise<T>){await c.query('BEGIN');try{await c.query("SELECT set_config('app.tenant_id',$1,true)",[actor.tenantId]);const r=await fn();await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}}
 try{
  claim=await tx(async()=>{
   const row=(await c.query("SELECT q.*,p.proposal FROM mutation_commands q JOIN decision_proposals p ON p.id=q.proposal_id WHERE (q.status='queued' AND q.available_at<=now()) OR (q.status='executing' AND q.lease_until<now()) ORDER BY q.created_at FOR UPDATE OF q SKIP LOCKED LIMIT 1")).rows[0];
   if(!row)return null;
   // A physical Ads resource can be connected in multiple authorized workspaces.
   // Serialize its external writes across those workspaces, while SQL remains tenant scoped.
   const key=`google_ads:${row.resource_name}`;
   if(!(await c.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[key])).rows[0].locked)return null;
   resourceLock=key;
   const lease=crypto.randomUUID();
   await c.query("UPDATE mutation_commands SET status='executing',lease_owner=$1,lease_until=now()+interval '120 seconds',attempt_count=attempt_count+1 WHERE id=$2",[lease,row.id]);
   await c.query("UPDATE decision_proposals SET status='executing' WHERE id=$1",[row.proposal_id]);
   return {...row,proposal:ProposalSchema.parse(row.proposal),lease_owner:lease,attempt_count:row.attempt_count+1} as Claimed;
  });
  if(!claim)return null;
  const cmd=claim,p=cmd.proposal;
  async function complete(status:'verified'|'aborted'|'quarantined',reason:string,state?:CampaignState,requestId:string|null=null){
   return tx(async()=>{
    const changed=await c.query('UPDATE mutation_commands SET status=$1,lease_until=NULL,lease_owner=NULL WHERE id=$2 AND lease_owner=$3 RETURNING id',[status,cmd.id,cmd.lease_owner]);
    if(!changed.rowCount)throw new Error('Execution lease lost');
    await c.query('UPDATE decision_proposals SET status=$1 WHERE id=$2',[status,p.id]);
    if(state)await c.query('INSERT INTO verification_results(tenant_id,id,command_id,matched,observed_state) VALUES($1,$2,$3,$4,$5)',[actor.tenantId,crypto.randomUUID(),cmd.id,status==='verified',state]);
    await c.query('INSERT INTO mutation_attempts(tenant_id,id,command_id,attempt,request_id,outcome,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)',[actor.tenantId,crypto.randomUUID(),cmd.id,cmd.attempt_count,requestId,status,{reason}]);
    await audit(c,actor,`command.${status}`,cmd.id,{proposalId:p.id,reason,adapter:'live',requestId});
    if(status==='quarantined')await c.query('INSERT INTO alerts(tenant_id,id,customer_id,severity,message) VALUES($1,$2,$3,$4,$5)',[actor.tenantId,crypto.randomUUID(),p.customerId,'critical',`External command ${cmd.id} quarantined: ${reason}`]);
    return {id:cmd.id,status,reason};
   });
  }
  async function retry(reason:string,error?:IntegrationError){
   if(cmd.attempt_count>=3)return await complete('quarantined',reason,undefined,error?.requestId);
   return tx(async()=>{
    const changed=await c.query("UPDATE mutation_commands SET status='queued',lease_until=NULL,lease_owner=NULL,available_at=now()+($1*interval '1 second') WHERE id=$2 AND lease_owner=$3 RETURNING id",[Math.max(2**cmd.attempt_count,error?.retryAfterSeconds??0),cmd.id,cmd.lease_owner]);if(!changed.rowCount)throw new Error('Execution lease lost');
    await c.query("UPDATE decision_proposals SET status='queued' WHERE id=$1",[p.id]);
    await c.query('INSERT INTO mutation_attempts(tenant_id,id,command_id,attempt,request_id,outcome,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)',[actor.tenantId,crypto.randomUUID(),cmd.id,cmd.attempt_count,error?.requestId??null,'retry',{reason}]);
    await audit(c,actor,'command.retry_scheduled',cmd.id,{reason,attempt:cmd.attempt_count});return {id:cmd.id,status:'queued',reason};
   });
  }
  // Crash recovery is read-only first, even if policy/approval has since expired or been revoked.
  let current:CampaignState;
  try{current=await adapter.read(null,actor,p.customerId,p.resourceName);}catch(e){if(e instanceof IntegrationError&&e.retryable)return await retry('Preflight read unavailable',e);return await complete('quarantined','Preflight read rejected');}
  if(cmd.ever_dispatched){
   if(matches(current,p.mutation.after))return await complete('verified','Persisted dispatch reconciled after restart',current);
   // An unchanged read cannot prove a remote write failed: delayed application remains possible.
   return await complete('quarantined','Prior dispatched outcome uncertain; no automatic replay',current);
  }
  if(cmd.attempt_count>3)return await complete('quarantined','Retry limit exhausted');
  const preflight=await tx(async()=>{
   const policy=await accountPolicy(c,p.customerId);
   const approval=await c.query("SELECT a.id FROM approval_events a JOIN memberships m ON m.tenant_id=a.tenant_id AND m.user_id=a.actor_id WHERE a.proposal_id=$1 AND a.policy_version=$2 AND a.decision='approved' AND m.role IN ('approver','owner')",[p.id,policy.version]);
   const gate=await c.query('SELECT id FROM execution_gates WHERE customer_id=$1 AND api_version=$2 AND enabled AND expires_at>now()',[p.customerId,apiVersion]);
   if(!approval.rowCount||!gate.rowCount)return {eligible:false,reasons:['Approval or validated execution gate unavailable'],mask:[] as string[]};
   const result=evaluatePolicy(p,policy,await evidenceSnapshots(c,p),current);
   if(!result.eligible)return result;
   // Persist intent BEFORE external mutation. A process crash can no longer erase evidence of dispatch.
   const changed=await c.query('UPDATE mutation_commands SET ever_dispatched=true WHERE id=$1 AND lease_owner=$2 RETURNING id',[cmd.id,cmd.lease_owner]);if(!changed.rowCount)throw new Error('Execution lease lost');
   await c.query('INSERT INTO mutation_attempts(tenant_id,id,command_id,attempt,outcome,metadata) VALUES($1,$2,$3,$4,$5,$6)',[actor.tenantId,crypto.randomUUID(),cmd.id,cmd.attempt_count,'dispatch_intent',{before:p.mutation.before,after:p.mutation.after,mask:result.mask,apiVersion}]);
   await audit(c,actor,'command.dispatch_intent',cmd.id,{proposalId:p.id,apiVersion,mask:result.mask});return result;
  });
  if(!preflight.eligible)return await complete('aborted',preflight.reasons.join('; '));
  let requestId:string|null=null;
  try{requestId=(await adapter.mutate(null,actor,p,preflight.mask)).requestId;}
  catch(e){
   // Never retry mutation solely on a network/5xx error. Read-back controls the outcome.
   if(e instanceof IntegrationError)requestId=e.requestId;
   try{const after=await adapter.read(null,actor,p.customerId,p.resourceName);if(matches(after,p.mutation.after))return await complete('verified','Ambiguous response reconciled',after,requestId);return await complete('quarantined','Dispatch rejected or ambiguous; manual reconciliation required',after,requestId);}catch{return await retry('Dispatch outcome unknown; recovery will read before any action',e instanceof IntegrationError?e:undefined);}
  }
  try{const after=await adapter.read(null,actor,p.customerId,p.resourceName);return await (matches(after,p.mutation.after)?complete('verified','External read-back confirms requested state',after,requestId):complete('quarantined','External read-back mismatch',after,requestId));}catch{return await retry('Read-back unavailable after dispatch');}
 }finally{
  // Explicit unlock is essential: pooled connections must never retain session-level locks.
  let destroyed=false;
  if(resourceLock)try{await c.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[resourceLock]);}catch{c.release(true);destroyed=true;}
  if(!destroyed)c.release();
 }
}
