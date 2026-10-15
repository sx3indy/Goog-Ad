import { PoolClient } from 'pg';
import { z } from 'zod';
import { Actor, PolicySchema, Proposal, ProposalSchema, Snapshot } from '../core/contracts';
import { evaluatePolicy, pacing } from '../core/policy';
import { AdsAdapter, AmbiguousOutcome, RetryableFailure, configuredAdapter } from './ads-adapter';
import { AppError, audit, requireRole, tenantTransaction } from './db';

export async function accountPolicy(c:PoolClient,customerId:string){
 const control=await c.query('SELECT killed,current_policy_version FROM account_controls WHERE customer_id=$1 FOR UPDATE',[customerId]);
 const {rows}=control.rows[0]?.current_policy_version?await c.query('SELECT document FROM account_policies WHERE customer_id=$1 AND version=$2',[customerId,control.rows[0].current_policy_version]):await c.query('SELECT document FROM account_policies WHERE customer_id=$1 ORDER BY created_at DESC,version DESC LIMIT 1',[customerId]);
 if(!rows[0] || !control.rows[0])throw new AppError(404,'Account policy missing');
 return {...PolicySchema.parse(rows[0].document),killed:control.rows[0].killed};
}
export async function evidenceSnapshots(c:PoolClient,p:Proposal):Promise<Snapshot[]>{
 const {rows}=await c.query('SELECT * FROM campaign_snapshots WHERE id=ANY($1::uuid[])',[p.evidence.map(e=>e.sourceSnapshotId)]);
 return rows.map(r=>({id:r.id,tenantId:r.tenant_id,customerId:r.customer_id,resourceName:r.resource_name,observedAt:r.observed_at.toISOString(),sourceAt:r.source_at.toISOString(),complete:r.complete,attributionMature:r.attribution_mature,metrics:r.metrics,state:r.state}));
}
export async function storeProposal(c:PoolClient,actor:Actor,input:unknown){
 const p=ProposalSchema.parse(input);if(p.tenantId!==actor.tenantId)throw new AppError(403,'Tenant mismatch');
 const account=await c.query('SELECT id FROM ad_accounts WHERE customer_id=$1',[p.customerId]);if(!account.rowCount)throw new AppError(404,'Account missing');
 const {rows}=await c.query('INSERT INTO decision_proposals(tenant_id,id,customer_id,resource_name,proposal,idempotency_key) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,idempotency_key) DO NOTHING RETURNING id',[actor.tenantId,p.id,p.customerId,p.resourceName,p,p.idempotencyKey]);
 if(!rows.length)throw new AppError(409,'Duplicate proposal key');
 for(const e of p.evidence){
  const source=await c.query('SELECT id FROM campaign_snapshots WHERE id=$1 AND customer_id=$2 AND resource_name=$3',[e.sourceSnapshotId,p.customerId,p.resourceName]);
  if(!source.rowCount)throw new AppError(422,'Evidence source not found in this account');
  await c.query('INSERT INTO evidence_records(tenant_id,id,proposal_id,snapshot_id,evidence) VALUES($1,$2,$3,$4,$5)',[actor.tenantId,crypto.randomUUID(),p.id,e.sourceSnapshotId,e]);
 }
 await audit(c,actor,'proposal.created',p.id,{origin:p.origin,modelVersion:p.modelVersion});return p;
}
export async function decide(actor:Actor,id:string,decision:'approve'|'reject'){
 requireRole(actor,['owner','approver']);z.uuid().parse(id);
 return tenantTransaction(actor,async c=>{
  const {rows}=await c.query('SELECT * FROM decision_proposals WHERE id=$1 FOR UPDATE',[id]);
  if(!rows[0])throw new AppError(404,'Proposal not found');
  const row=rows[0];if(row.status!=='pending')throw new AppError(409,'Proposal has already been reviewed');
  const p=ProposalSchema.parse(row.proposal),policy=await accountPolicy(c,p.customerId);
  if(decision==='reject'){
   await c.query("UPDATE decision_proposals SET status='rejected' WHERE id=$1",[id]);
  }else{
   const state=process.env.APP_MODE==='demo'?await configuredAdapter().read(c,actor,p.customerId,p.resourceName):(await c.query('SELECT state FROM campaign_snapshots WHERE customer_id=$1 AND resource_name=$2 ORDER BY observed_at DESC LIMIT 1',[p.customerId,p.resourceName])).rows[0]?.state;
   if(!state)throw new AppError(422,'Current reporting state unavailable');
   const result=evaluatePolicy(p,policy,await evidenceSnapshots(c,p),state);
   if(!result.eligible)throw new AppError(422,result.reasons.join('; '));
   await c.query("UPDATE decision_proposals SET status='queued' WHERE id=$1",[id]);
   await c.query('INSERT INTO mutation_commands(tenant_id,id,proposal_id,resource_name,idempotency_key) VALUES($1,$2,$3,$4,$5)',[actor.tenantId,crypto.randomUUID(),id,p.resourceName,p.idempotencyKey]);
  }
  await c.query('INSERT INTO approval_events(tenant_id,id,proposal_id,actor_id,decision,policy_version) VALUES($1,$2,$3,$4,$5,$6)',[actor.tenantId,crypto.randomUUID(),id,actor.userId,decision==='approve'?'approved':'rejected',policy.version]);
  await audit(c,actor,`proposal.${decision==='approve'?'approved':'rejected'}`,id,{policyVersion:policy.version});return {status:decision==='approve'?'queued':'rejected'};
 });
}
const matches=(state:Record<string,unknown>,desired:Record<string,unknown>)=>Object.entries(desired).every(([k,v])=>state[k]===v);
export async function runOne(actor:Actor,adapter:AdsAdapter=configuredAdapter()){
 if(adapter.mode==='live')throw new Error('Live execution requires the durable external executor');
 return tenantTransaction(actor,async c=>{
  const {rows}=await c.query("SELECT q.*,p.proposal FROM mutation_commands q JOIN decision_proposals p ON p.id=q.proposal_id WHERE q.status='queued' AND q.available_at<=now() AND (q.lease_until IS NULL OR q.lease_until<now()) ORDER BY q.created_at FOR UPDATE OF q SKIP LOCKED LIMIT 1");
  if(!rows[0])return null;const cmd=rows[0],p=ProposalSchema.parse(cmd.proposal);
  const lock=await c.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked',[`${actor.tenantId}:${p.resourceName}`]);if(!lock.rows[0].locked)return null;
  await c.query("UPDATE mutation_commands SET lease_until=now()+interval '60 seconds' WHERE id=$1",[cmd.id]);
  const policy=await accountPolicy(c,p.customerId);
  const approval=await c.query("SELECT a.id,m.role FROM approval_events a JOIN memberships m ON m.user_id=a.actor_id AND m.tenant_id=a.tenant_id WHERE a.proposal_id=$1 AND a.decision='approved' AND a.policy_version=$2 AND m.role IN ('owner','approver')",[p.id,policy.version]);
  async function finish(status:'verified'|'aborted'|'quarantined',reason:string,state?:Record<string,unknown>){
   await c.query('UPDATE mutation_commands SET status=$1,lease_until=NULL WHERE id=$2',[status,cmd.id]);
   await c.query('UPDATE decision_proposals SET status=$1 WHERE id=$2',[status,p.id]);
   if(state)await c.query('INSERT INTO verification_results(tenant_id,id,command_id,matched,observed_state) VALUES($1,$2,$3,$4,$5)',[actor.tenantId,crypto.randomUUID(),cmd.id,status==='verified',state]);
   await audit(c,actor,`command.${status}`,cmd.id,{proposalId:p.id,reason,adapter:adapter.mode});
   if(status==='quarantined')await c.query('INSERT INTO alerts(tenant_id,id,customer_id,severity,message) VALUES($1,$2,$3,$4,$5)',[actor.tenantId,crypto.randomUUID(),p.customerId,'critical',`Command ${cmd.id} quarantined: ${reason}`]);
   return {id:cmd.id,status,reason};
  }
  if(!approval.rowCount || policy.killed)return finish('aborted','Approval revoked, policy changed, or kill switch active');
  let state;
  try{state=await adapter.read(c,actor,p.customerId,p.resourceName);}catch{return retry('Read-back unavailable',null);}
  // A prior attempt may have reached Ads despite losing the response. Never blindly replay it.
  if(cmd.attempt_count>0 && matches(state,p.mutation.after))return finish('verified','Prior ambiguous outcome reconciled',state);
  const result=evaluatePolicy(p,policy,await evidenceSnapshots(c,p),state);
  if(!result.eligible)return finish('aborted',result.reasons.join('; '));
  async function retry(reason:string,requestId:string|null){
   const n=cmd.attempt_count+1;
   await c.query('INSERT INTO mutation_attempts(tenant_id,id,command_id,attempt,request_id,outcome,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)',[actor.tenantId,crypto.randomUUID(),cmd.id,n,requestId,'retry',{reason}]);
   await c.query("UPDATE mutation_commands SET attempt_count=$1,lease_until=NULL,available_at=now()+($2 * interval '1 second') WHERE id=$3",[n,Math.min(60,2**n),cmd.id]);
   if(n>=3)return finish('quarantined',reason);
   await audit(c,actor,'command.retry_scheduled',cmd.id,{attempt:n,reason});return {id:cmd.id,status:'queued',reason};
  }
  let requestId:string|null=null,ambiguous=false;
  try{const response=await adapter.mutate(c,actor,p,result.mask);requestId=response.requestId;}
  catch(e){if(e instanceof AmbiguousOutcome)ambiguous=true;else if(e instanceof RetryableFailure)return retry(e.message,null);else return finish('quarantined','Adapter rejected mutation');}
  let after;
  try{after=await adapter.read(c,actor,p.customerId,p.resourceName);}catch{return retry('Mutation read-back unavailable; reconciliation required',requestId);}
  await c.query('INSERT INTO mutation_attempts(tenant_id,id,command_id,attempt,request_id,outcome,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)',[actor.tenantId,crypto.randomUUID(),cmd.id,cmd.attempt_count+1,requestId,ambiguous?'ambiguous_reconciled':'responded',{mask:result.mask}]);
  if(matches(after,p.mutation.after))return finish('verified',ambiguous?'Response lost; read-back confirms desired state':'Read-back confirms desired state',after);
  return finish('quarantined','Read-back mismatch; operator reconciliation required',after);
 });
}
export async function killSwitch(actor:Actor,customerId:string,killed:boolean){
 requireRole(actor,['owner']);return tenantTransaction(actor,async c=>{
  const {rows}=await c.query('UPDATE account_controls SET killed=$1,updated_at=now() WHERE customer_id=$2 RETURNING id',[killed,customerId]);
  if(!rows[0])throw new AppError(404,'Account not found');
  await audit(c,actor,killed?'account.kill_switch_enabled':'account.kill_switch_disabled',customerId,{killed});return {killed};
 });
}
export async function dashboard(actor:Actor){
 return tenantTransaction(actor,async c=>{
  const account=(await c.query('SELECT * FROM ad_accounts ORDER BY name LIMIT 1')).rows[0];if(!account)throw new AppError(404,'No account provisioned');
  let campaigns=(await c.query('SELECT DISTINCT ON(resource_name) * FROM campaign_snapshots WHERE customer_id=$1 ORDER BY resource_name,observed_at DESC',[account.customer_id])).rows;
  const accountSnapshot=process.env.APP_MODE==='live'?(await c.query('SELECT * FROM account_snapshots WHERE customer_id=$1 ORDER BY account_local_date DESC,observed_at DESC LIMIT 1',[account.customer_id])).rows[0]:null;
  if(process.env.APP_MODE==='live')campaigns=accountSnapshot?campaigns.filter(s=>accountSnapshot.campaign_resources.includes(s.resource_name)&&s.observed_at.getTime()===accountSnapshot.observed_at.getTime()):[];
  const policy=await accountPolicy(c,account.customer_id);
  const proposals=(await c.query('SELECT * FROM decision_proposals ORDER BY created_at DESC LIMIT 50')).rows;
  const enriched=[];for(const row of proposals){const p=ProposalSchema.parse(row.proposal);let state;try{state=process.env.APP_MODE==='demo'?await configuredAdapter().read(c,actor,p.customerId,p.resourceName):campaigns.find(s=>s.resource_name===p.resourceName)?.state;}catch{state=undefined;}
   enriched.push({...row,guard:state?evaluatePolicy(p,policy,await evidenceSnapshots(c,p),state):{eligible:false,reasons:['Current resource state unavailable'],requiresApproval:true,mask:[]}});
  }
  const outcomes=(await c.query('SELECT stage,count(*)::int AS count,sum(revenue_micros)::text AS revenue_micros,sum(cost_micros)::text AS cost_micros FROM crm_outcomes WHERE customer_id=$1 AND finalized=true GROUP BY stage',[account.customer_id])).rows;
  const events=(await c.query('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 30')).rows;
  const alerts=(await c.query('SELECT * FROM alerts WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 20')).rows;
  const queue=(await c.query('SELECT status,count(*)::int AS count FROM mutation_commands GROUP BY status')).rows;
  const validSpend=campaigns.length>0 && campaigns.every(s=>typeof s.metrics.spendMicros==='string' && /^(0|[1-9]\d{0,17})$/.test(s.metrics.spendMicros));
  const spend=process.env.APP_MODE==='live'?(accountSnapshot?.spend_micros??null):validSpend?campaigns.reduce((n,s)=>n+BigInt(s.metrics.spendMicros),0n).toString():null;
  const fresh=process.env.APP_MODE==='live'?!!(accountSnapshot?.complete&&accountSnapshot.currency===account.currency&&accountSnapshot.observed_at.getTime()<=Date.now()&&Date.now()-accountSnapshot.observed_at.getTime()<=policy.freshnessMinutes*60000):validSpend && campaigns.every(s=>s.complete && s.currency===account.currency && new Date(s.source_at).getTime()<=Date.now() && Date.now()-new Date(s.source_at).getTime()<=policy.freshnessMinutes*60000);
  // Demo fixtures represent a known 60% elapsed reporting day; live pacing needs calendar/timezone-aware ingestion.
  const forecast=process.env.APP_MODE==='demo'?pacing(fresh?spend:null,policy.dailyPlannedMicros,.6,fresh):pacing(null,policy.dailyPlannedMicros,0,false);
  const history=process.env.APP_MODE==='live'?(await c.query("SELECT DISTINCT ON(account_local_date) account_local_date::text AS day,spend_micros FROM account_snapshots WHERE customer_id=$1 AND complete ORDER BY account_local_date DESC,observed_at DESC LIMIT 7",[account.customer_id])).rows.reverse():(await c.query("SELECT account_local_date::text AS day,CASE WHEN bool_and(complete AND (metrics->>'spendMicros') IS NOT NULL AND (metrics->>'spendMicros') ~ '^(0|[1-9][0-9]{0,17})$') THEN sum(CASE WHEN (metrics->>'spendMicros') ~ '^(0|[1-9][0-9]{0,17})$' THEN (metrics->>'spendMicros')::bigint END)::text ELSE NULL END AS spend_micros FROM (SELECT DISTINCT ON(resource_name,account_local_date) * FROM campaign_snapshots WHERE customer_id=$1 ORDER BY resource_name,account_local_date,observed_at DESC) daily GROUP BY account_local_date ORDER BY account_local_date DESC LIMIT 7",[account.customer_id])).rows.reverse();
  const integrations=(await c.query('SELECT DISTINCT ON(provider) provider,status,started_at,completed_at,summary FROM integration_runs WHERE customer_id=$1 ORDER BY provider,started_at DESC',[account.customer_id])).rows;
  const jobs=(await c.query('SELECT id,provider,status,created_at,result FROM integration_jobs WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 20',[account.customer_id])).rows;
  const gate=(await c.query('SELECT enabled,api_version,expires_at FROM execution_gates WHERE customer_id=$1',[account.customer_id])).rows[0];
  const identity=(await c.query('SELECT display_name FROM users WHERE id=$1',[actor.userId])).rows[0];
  return {mode:process.env.APP_MODE,actor:{role:actor.role,displayName:identity?.display_name??'Operator'},account,policy,campaigns,proposals:enriched,outcomes,events,alerts,queue,history,integrations,jobs,executionGate:gate??null,spendMicros:fresh?spend:null,fresh,forecast};
 });
}
