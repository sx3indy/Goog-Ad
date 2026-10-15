import { Pool, PoolClient } from 'pg';
import { Actor } from '../core/contracts';
const globalDb=globalThis as unknown as {adsPool?:Pool};
export function pool(){
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const url=new URL(process.env.DATABASE_URL);
  if(process.env.APP_MODE==='live'&&!['localhost','127.0.0.1','::1'].includes(url.hostname)&&url.searchParams.get('sslmode')!=='verify-full')throw new Error('Managed PostgreSQL requires sslmode=verify-full');
  const max=Number(process.env.DB_POOL_MAX??(process.env.APP_MODE==='live'?'2':'8'));
  if(!Number.isInteger(max)||max<2||max>20)throw new Error('DB_POOL_MAX must be an integer from 2 through 20');
  return globalDb.adsPool ??= new Pool({connectionString:process.env.DATABASE_URL,max,application_name:'goog-ad',idleTimeoutMillis:10000,connectionTimeoutMillis:5000,statement_timeout:15000,idle_in_transaction_session_timeout:30000});
}
export async function tenantTransaction<T>(actor:Actor,fn:(client:PoolClient)=>Promise<T>):Promise<T>{
  const c=await pool().connect();
  try{await c.query('BEGIN');await c.query("SELECT set_config('app.tenant_id',$1,true)",[actor.tenantId]);const result=await fn(c);await c.query('COMMIT');return result;}
  catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
export async function audit(c:PoolClient,actor:Actor,event:string,resource:string,details:Record<string,unknown>){
  await c.query('INSERT INTO audit_events(tenant_id,id,actor_id,event_type,resource_id,details) VALUES($1,$2,$3,$4,$5,$6)',[actor.tenantId,crypto.randomUUID(),actor.userId,event,resource,details]);
}
export class AppError extends Error { constructor(public status:number,message:string){super(message);} }
export function requireRole(actor:Actor,roles:Actor['role'][]){if(!roles.includes(actor.role)) throw new AppError(403,'Your role cannot perform this action');}
