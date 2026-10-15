import { Client, PoolClient } from 'pg';
import { Actor, defaultPolicy, Proposal } from '../src/core/contracts';
export async function createFixture(c:PoolClient|Client,actor:Actor,customerId='1234567890',name='Evergreen Living'){
 const now=new Date(), windowStart=new Date(now.getTime()-30*86400000);
 await c.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[actor.tenantId,name]);
 await c.query('INSERT INTO users(id,display_name) VALUES($1,$2) ON CONFLICT DO NOTHING',[actor.userId,'Alex Morgan']);
 await c.query('INSERT INTO memberships(tenant_id,id,user_id,role) VALUES($1,$2,$3,$4)',[actor.tenantId,crypto.randomUUID(),actor.userId,actor.role]);
 await c.query('INSERT INTO ad_accounts(tenant_id,id,customer_id,name) VALUES($1,$2,$3,$4)',[actor.tenantId,crypto.randomUUID(),customerId,name]);
 await c.query('INSERT INTO account_policies(tenant_id,id,customer_id,version,document) VALUES($1,$2,$3,$4,$5)',[actor.tenantId,crypto.randomUUID(),customerId,defaultPolicy.version,defaultPolicy]);
 await c.query('INSERT INTO account_controls(tenant_id,id,customer_id) VALUES($1,$2,$3)',[actor.tenantId,crypto.randomUUID(),customerId]);
 const campaigns=[['Assisted Living · Search',68000000,85,1540,62,7,24],['Memory Care · Search',54000000,70,1210,47,4,78],['Senior Living · Local',32000000,50,980,39,6,31],['Brand · Evergreen',29000000,45,840,54,9,18]] as const;
 const proposals:Proposal[]=[];
 for(let i=0;i<campaigns.length;i++){
  const [campaignName,spend,budget,impressions,clicks,qualified,cpa]=campaigns[i],resourceName=`customers/${customerId}/campaigns/${i+1}`,snapshotId=crypto.randomUUID(),state={status:'ENABLED',budgetMicros:(BigInt(budget)*1000000n).toString()};
  const metrics={spendMicros:String(spend),impressions,clicks,qualifiedLeads:qualified,qualifiedCpa:cpa,matureSpendMicros:String(cpa*50*1000000),matureQualifiedLeads:50,sampleSize:150+i*25,metricWindowDays:30};
  await c.query('INSERT INTO demo_resource_state(tenant_id,id,customer_id,resource_name,state) VALUES($1,$2,$3,$4,$5)',[actor.tenantId,crypto.randomUUID(),customerId,resourceName,state]);
  for(let day=6;day>=0;day--){const at=new Date(now.getTime()-day*86400000),daily={...metrics,spendMicros:String(Math.round(spend*(day?(.7+((day+i)%4)*.09):1)))};
   await c.query('INSERT INTO campaign_snapshots(tenant_id,id,customer_id,resource_name,name,observed_at,source_at,account_local_date,currency,complete,attribution_mature,metrics,state) VALUES($1,$2,$3,$4,$5,$6,$6,($6::timestamptz AT TIME ZONE $7)::date,$8,true,true,$9,$10)',[actor.tenantId,day?crypto.randomUUID():snapshotId,customerId,resourceName,campaignName,at,'America/New_York','USD',daily,state]);
  }
  if(i===1){
   const p:Proposal={id:crypto.randomUUID(),tenantId:actor.tenantId,customerId,resourceName,action:'UPDATE_BUDGET',observedAt:now.toISOString(),evidenceWindow:{start:windowStart.toISOString(),end:now.toISOString()},evidence:[{metric:'qualifiedCpa',value:cpa,sampleSize:metrics.sampleSize,sourceSnapshotId:snapshotId,attributionMature:true}],expectedImpact:{metric:'daily_budget_micros',estimate:-3500000,lowerBound:-3500000,upperBound:-3500000},mutation:{before:{budgetMicros:state.budgetMicros},after:{budgetMicros:'66500000'}},policyVersion:defaultPolicy.version,modelVersion:null,expiresAt:new Date(now.getTime()+3600000).toISOString(),idempotencyKey:`fixture:${actor.tenantId}:budget`,title:'Reduce Memory Care budget by 5%',explanation:'Mature 30-day qualified-lead CPA is $78 across 175 historical click observations, above the demo baseline of $60. The synthetic cohort has 50 finalized leads and $3,900 spend. A 5% budget reduction lowers planned exposure by $3.50 per day. Conversion impact is unknown; this is a proposal for human review.',origin:'diagnostic'};
   await c.query('INSERT INTO decision_proposals(tenant_id,id,customer_id,resource_name,proposal,idempotency_key) VALUES($1,$2,$3,$4,$5,$6)',[actor.tenantId,p.id,customerId,resourceName,p,p.idempotencyKey]);
   await c.query('INSERT INTO evidence_records(tenant_id,id,proposal_id,snapshot_id,evidence) VALUES($1,$2,$3,$4,$5)',[actor.tenantId,crypto.randomUUID(),p.id,snapshotId,p.evidence[0]]);proposals.push(p);
  }
 }
 const stages=[['inquiry',42],['qualified',26],['tour',12],['move_in',4],['paid',2]] as const;
 for(const [stage,count]of stages)for(let i=0;i<count;i++)await c.query('INSERT INTO crm_outcomes(tenant_id,id,customer_id,external_id,stage,finalized,revenue_micros,cost_micros,currency,event_time) VALUES($1,$2,$3,$4,$5,true,$6,$7,$8,$9)',[actor.tenantId,crypto.randomUUID(),customerId,`fixture-${stage}-${i}`,stage,stage==='paid'?'4000000000':'0',stage==='paid'?'1200000000':'0','USD',now]);
 await c.query('INSERT INTO alerts(tenant_id,id,customer_id,severity,message) VALUES($1,$2,$3,$4,$5)',[actor.tenantId,crypto.randomUUID(),customerId,'warning','Risk-adjusted spend forecast exceeds planned daily spend. Review pacing; this is not a validated emergency pause trigger.']);
 await c.query('INSERT INTO audit_events(tenant_id,id,actor_id,event_type,resource_id,details) VALUES($1,$2,$3,$4,$5,$6)',[actor.tenantId,crypto.randomUUID(),actor.userId,'demo.initialized',customerId,{synthetic:true,source:'seed-v1'}]);
 return {proposals,customerId};
}
