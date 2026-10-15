import { Actor,PolicySchema } from '../core/contracts';
import { AppError,audit,requireRole,tenantTransaction } from './db';
import { accountPolicy } from './service';
export async function updatePolicy(actor:Actor,customerId:string,input:unknown){
 requireRole(actor,['owner']);const next=PolicySchema.omit({version:true,killed:true}).parse(input);
 if(!['L0','L1','L2'].includes(next.autonomy))throw new AppError(422,'Autonomy requires experiment graduation; only observation, recommendation and human approval are available');
 if(next.autonomy==='L2'&&BigInt(next.dailyPlannedMicros)<=0n)throw new AppError(422,'Approved execution requires positive planned spend');
 return tenantTransaction(actor,async c=>{
  const prior=await accountPolicy(c,customerId),version=crypto.randomUUID(),document={...next,version,killed:false};
  await c.query('INSERT INTO account_policies(tenant_id,id,customer_id,version,document) VALUES($1,$2,$3,$4,$5)',[actor.tenantId,crypto.randomUUID(),customerId,version,document]);
  await c.query('UPDATE account_controls SET current_policy_version=$1,updated_at=now() WHERE customer_id=$2',[version,customerId]);
  await audit(c,actor,'policy.updated',customerId,{beforeVersion:prior.version,version,autonomy:next.autonomy});return {version};
 });
}
