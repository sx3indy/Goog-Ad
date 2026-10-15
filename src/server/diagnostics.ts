import { PoolClient } from 'pg';
import { Actor, Proposal } from '../core/contracts';
import { accountPolicy, storeProposal } from './service';
import { audit, requireRole, tenantTransaction, AppError } from './db';

export async function diagnostics(c:PoolClient,actor:Actor,customerId:string){
 const policy=await accountPolicy(c,customerId);
 const expired=await c.query("UPDATE decision_proposals SET status='aborted' WHERE customer_id=$1 AND status='pending' AND (proposal->>'expiresAt')::timestamptz<=now() RETURNING id",[customerId]);
 for(const row of expired.rows)await audit(c,actor,'proposal.expired',row.id,{reason:'Proposal expired before review; a fresh proposal is required'});
 const {rows}=await c.query('SELECT DISTINCT ON(resource_name) * FROM campaign_snapshots WHERE customer_id=$1 ORDER BY resource_name,observed_at DESC',[customerId]);
 const created:Proposal[]=[];
 for(const s of rows){
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${actor.tenantId}:diagnostics:${s.resource_name}`]);
  if(s.state.status!=='ENABLED' || typeof s.metrics.qualifiedCpa!=='number' || !Number.isFinite(s.metrics.qualifiedCpa) || s.metrics.qualifiedCpa<=60 || !s.complete || !s.attribution_mature || Date.now()-s.source_at.getTime()>policy.freshnessMinutes*60000)continue;
  if((await c.query("SELECT id FROM decision_proposals WHERE resource_name=$1 AND status IN ('pending','queued')",[s.resource_name])).rowCount)continue;
  const before=BigInt(s.state.budgetMicros),after=before*95n/100n;
  const p:Proposal={id:crypto.randomUUID(),tenantId:actor.tenantId,customerId,resourceName:s.resource_name,action:'UPDATE_BUDGET',observedAt:s.observed_at.toISOString(),evidenceWindow:{start:new Date(s.observed_at.getTime()-30*86400000).toISOString(),end:s.observed_at.toISOString()},evidence:[{metric:'qualifiedCpa',value:s.metrics.qualifiedCpa,sampleSize:s.metrics.sampleSize,sourceSnapshotId:s.id,attributionMature:s.attribution_mature}],expectedImpact:{metric:'daily_budget_micros',estimate:Number(after-before),lowerBound:Number(after-before),upperBound:Number(after-before)},mutation:{before:{budgetMicros:before.toString()},after:{budgetMicros:after.toString()}},policyVersion:policy.version,modelVersion:null,expiresAt:new Date(Date.now()+3600000).toISOString(),idempotencyKey:`diagnostic:${s.id}:reduce-5`,title:`Reduce ${s.name} budget by 5%`,explanation:`Mature 30-day qualified-lead CPA of $${s.metrics.qualifiedCpa} exceeds the demo baseline of $60 across ${s.metrics.sampleSize} historical click observations. This proposes a conservative budget reduction. Planned exposure falls by 5%; conversion impact is unknown. Current-day spend is a separate reporting window.`,origin:'diagnostic'};
  created.push(await storeProposal(c,actor,p));
 }
 await audit(c,actor,'diagnostics.completed',customerId,{created:created.length,baselineVersion:'demo-cpa-60-v1'});return created;
}
export async function refreshDemo(actor:Actor,customerId:string){
 requireRole(actor,['owner','analyst']);if(process.env.APP_MODE!=='demo')throw new AppError(503,'Live ingestion adapter not configured');
 return tenantTransaction(actor,async c=>{
  const {rows}=await c.query('SELECT DISTINCT ON(s.resource_name) s.*,r.state AS current_state FROM campaign_snapshots s JOIN demo_resource_state r ON r.resource_name=s.resource_name AND r.tenant_id=s.tenant_id WHERE s.customer_id=$1 ORDER BY s.resource_name,s.observed_at DESC',[customerId]);
  if(!rows.length)throw new AppError(404,'Account not found');
  for(const s of rows)await c.query('INSERT INTO campaign_snapshots(tenant_id,id,customer_id,resource_name,name,observed_at,source_at,account_local_date,currency,complete,attribution_mature,metrics,state) VALUES($1,$2,$3,$4,$5,now(),now(),(now() AT TIME ZONE $6)::date,$7,true,true,$8,$9)',[actor.tenantId,crypto.randomUUID(),customerId,s.resource_name,s.name,s.account_timezone??'America/New_York',s.currency,s.metrics,s.current_state]);
  await audit(c,actor,'ingestion.demo_refreshed',customerId,{snapshots:rows.length,synthetic:true});
  const proposals=await diagnostics(c,actor,customerId);return {snapshots:rows.length,proposals:proposals.length};
 });
}
