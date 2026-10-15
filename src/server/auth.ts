import { auth } from '@clerk/nextjs/server';
import { Actor, DEMO_TENANT, DEMO_USER } from '../core/contracts';
import { AppError, pool, tenantTransaction } from './db';
export async function getActor():Promise<Actor>{
 if(process.env.APP_MODE==='demo') return {tenantId:DEMO_TENANT,userId:DEMO_USER,role:'owner'};
 if(process.env.APP_MODE!=='live') throw new AppError(503,'APP_MODE must be explicitly demo or live');
 const {userId,orgId}=await auth();if(!userId || !orgId)throw new AppError(401,'Sign in and select an organization');
 // Clerk organization IDs are not tenant UUIDs. A server-managed mapping is required.
 const mapping=await pool().query('SELECT tenant_id FROM tenant_identities WHERE clerk_org_id=$1',[orgId]);
 const tenantId=mapping.rows[0]?.tenant_id??process.env[`CLERK_TENANT_${orgId}`];if(!tenantId)throw new AppError(403,'Organization is not provisioned');
 const actor:Actor={tenantId,userId:'',role:'viewer'};
 return tenantTransaction(actor,async c=>{
  const {rows}=await c.query('SELECT m.user_id,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE u.clerk_id=$1 AND m.tenant_id=$2',[userId,tenantId]);
  if(!rows[0]) throw new AppError(403,'No tenant membership');return {...actor,userId:rows[0].user_id,role:rows[0].role};
 });
}
export function checkOrigin(request:Request){
 const allowed=process.env.APP_ORIGIN;if(!allowed) throw new AppError(503,'APP_ORIGIN is required');
 if(request.headers.get('origin')!==allowed) throw new AppError(403,'Request origin rejected');
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json') throw new AppError(415,'JSON required');
}
