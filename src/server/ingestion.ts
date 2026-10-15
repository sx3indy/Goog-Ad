import { z } from 'zod';
import { Actor } from '../core/contracts';
import { audit,tenantTransaction } from './db';
import { GoogleAdsAdapter } from './integrations/google-ads';
import { HubSpotClient } from './integrations/hubspot';
import { reconcileOutcome } from './outcomes';
const Money=z.string().regex(/^(0|[1-9]\d{0,17})$/);
export async function ingestionRun<T>(actor:Actor,customerId:string,provider:string,key:string,work:()=>Promise<T>){
 let id=crypto.randomUUID();
 const claimed=await tenantTransaction(actor,async c=>{
  const existing=(await c.query('SELECT * FROM integration_runs WHERE idempotency_key=$1 FOR UPDATE',[key])).rows[0];
  if(existing?.status==='completed'||existing?.status==='running'&&Date.now()-existing.started_at.getTime()<600000)return false;
  if(existing){id=existing.id;await c.query("UPDATE integration_runs SET status='running',started_at=now(),completed_at=NULL,summary='{}' WHERE id=$1",[id]);return true;}
  const result=await c.query("INSERT INTO integration_runs(tenant_id,id,customer_id,provider,status,idempotency_key) VALUES($1,$2,$3,$4,'running',$5) ON CONFLICT(tenant_id,idempotency_key) DO NOTHING RETURNING id",[actor.tenantId,id,customerId,provider,key]);return !!result.rowCount;
 });
 if(!claimed)return {status:'already_claimed'};
 try{const result=await work();await tenantTransaction(actor,async c=>{await c.query("UPDATE integration_runs SET status='completed',completed_at=now(),summary=$1 WHERE id=$2",[{result},id]);await audit(c,actor,'ingestion.completed',id,{provider,customerId});});return {status:'completed',result};}
 catch(error){await tenantTransaction(actor,async c=>{await c.query("UPDATE integration_runs SET status='failed',completed_at=now(),summary=$1 WHERE id=$2",[{error:'Integration operation failed; inspect classified provider status'},id]);await audit(c,actor,'ingestion.failed',id,{provider,customerId});});throw error;}
}
export async function ingestAds(actor:Actor,customerId:string,adapter:GoogleAdsAdapter,key:string){
 return ingestionRun(actor,customerId,'google_ads',key,async()=>{
  const customerRows=await adapter.search(actor,customerId,'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1');
  if(customerRows.length!==1)throw new Error('Customer metadata missing');
  const meta=z.object({customer:z.object({id:z.union([z.string(),z.number()]).transform(String),descriptiveName:z.string().default('Google Ads account'),currencyCode:z.string().regex(/^[A-Z]{3}$/),timeZone:z.string(),manager:z.boolean().default(false)})}).parse(customerRows[0]).customer;
  if(meta.id!==customerId)throw new Error('Customer ownership response mismatch');
  if(meta.manager)throw new Error('Configure advertising customer IDs; manager accounts require explicit child-account provisioning');
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:meta.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const resources=await adapter.search(actor,customerId,"SELECT campaign.resource_name, campaign.name, campaign.status, campaign.campaign_budget, campaign_budget.amount_micros, campaign_budget.explicitly_shared FROM campaign WHERE campaign.status != 'REMOVED'");
  const reporting=await adapter.search(actor,customerId,`SELECT campaign.resource_name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date = '${date}' AND campaign.status != 'REMOVED'`);
  // Customer totals include spend from removed campaigns and do not depend on active inventory.
  const reportingDates=Array.from({length:8},(_,i)=>new Date(Date.parse(date+'T00:00:00Z')-(7-i)*86400000).toISOString().slice(0,10));
  const accountReport=await adapter.search(actor,customerId,`SELECT customer.id, segments.date, metrics.cost_micros FROM customer WHERE segments.date BETWEEN '${reportingDates[0]}' AND '${date}'`);
  const accountDays=new Map<string,string>();
  for(const row of accountReport){const r=z.object({customer:z.object({id:z.union([z.string(),z.number()]).transform(String)}),segments:z.object({date:z.iso.date()}),metrics:z.object({costMicros:Money.default('0')}).default({costMicros:'0'})}).parse(row);if(r.customer.id!==customerId||!reportingDates.includes(r.segments.date))throw new Error('Account reporting scope or date mismatch');if(accountDays.has(r.segments.date))throw new Error('Duplicate account reporting day');accountDays.set(r.segments.date,r.metrics.costMicros);}
  const accountSpend=accountDays.get(date)??'0';
  const counts=new Map<string,{spendMicros:string;impressions:number;clicks:number;platformConversions:number}>();
  for(const row of reporting){const r=z.object({campaign:z.object({resourceName:z.string()}),metrics:z.object({costMicros:Money.default('0'),impressions:z.union([z.string(),z.number()]).default('0'),clicks:z.union([z.string(),z.number()]).default('0'),conversions:z.number().nonnegative().default(0)})}).parse(row);const impressions=Number(r.metrics.impressions),clicks=Number(r.metrics.clicks);if(!Number.isSafeInteger(impressions)||!Number.isSafeInteger(clicks)||impressions<0||clicks<0)throw new Error('Invalid report counts');if(counts.has(r.campaign.resourceName))throw new Error('Duplicate campaign reporting row');counts.set(r.campaign.resourceName,{spendMicros:r.metrics.costMicros,impressions,clicks,platformConversions:r.metrics.conversions});}
  const observed=new Date();
  const normalized=resources.map(row=>z.object({campaign:z.object({resourceName:z.string().regex(new RegExp(`^customers/${customerId}/campaigns/[0-9]+$`)),name:z.string(),status:z.enum(['ENABLED','PAUSED']),campaignBudget:z.string().regex(new RegExp(`^customers/${customerId}/campaignBudgets/[0-9]+$`))}),campaignBudget:z.object({amountMicros:Money,explicitlyShared:z.boolean().default(false)})}).parse(row));
  if(new Set(normalized.map(r=>r.campaign.resourceName)).size!==normalized.length)throw new Error('Duplicate campaign resource');
  if(reporting.some(r=>!normalized.some(n=>n.campaign.resourceName===(r.campaign as {resourceName:string}).resourceName)))throw new Error('Reporting resource set mismatch');
  await tenantTransaction(actor,async c=>{
   const account=(await c.query('SELECT * FROM ad_accounts WHERE customer_id=$1 FOR UPDATE',[customerId])).rows[0];if(!account)throw new Error('Account not provisioned');
   if(account.currency!==meta.currencyCode)throw new Error('Account currency differs from provisioned currency');
   await c.query("UPDATE ad_accounts SET name=$1,timezone=$2,connection_status='connected' WHERE customer_id=$3",[meta.descriptiveName,meta.timeZone,customerId]);
   for(const reportingDate of reportingDates)await c.query('INSERT INTO account_snapshots(tenant_id,id,customer_id,observed_at,account_local_date,currency,spend_micros,complete,reporting_lag_uncertain,campaign_resources) VALUES($1,$2,$3,$4,$5,$6,$7,true,true,$8)',[actor.tenantId,crypto.randomUUID(),customerId,observed,reportingDate,meta.currencyCode,accountDays.get(reportingDate)??'0',reportingDate===date?normalized.map(r=>r.campaign.resourceName):[]]);
   for(const r of normalized){
    // Protobuf-default zero values are accepted only after both complete paginated queries succeeded.
    const metrics={...(counts.get(r.campaign.resourceName)??{spendMicros:'0',impressions:0,clicks:0,platformConversions:0}),reportingLagUncertain:true,businessAttribution:'not_reconciled'};
    const state={status:r.campaign.status,budgetMicros:r.campaignBudget.amountMicros,budgetResourceName:r.campaign.campaignBudget,sharedBudget:r.campaignBudget.explicitlyShared};
    await c.query('INSERT INTO campaign_snapshots(tenant_id,id,customer_id,resource_name,name,observed_at,source_at,account_local_date,currency,complete,attribution_mature,metrics,state) VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,true,false,$9,$10)',[actor.tenantId,crypto.randomUUID(),customerId,r.campaign.resourceName,r.campaign.name,observed,date,meta.currencyCode,metrics,state]);
   }
  });return {campaigns:normalized.length,accountSpendMicros:accountSpend,reconciledDays:reportingDates.length,reportingDate:date,reportingLag:'uncertain',businessAttribution:'not_reconciled'};
 });
}
export async function ingestHubSpot(actor:Actor,customerId:string,adapter:Pick<HubSpotClient,'outcomes'>,key:string){
 return ingestionRun(actor,customerId,'hubspot',key,async()=>{
  const data=await adapter.outcomes(actor);let created=0,corrected=0,duplicates=0;
  for(const outcome of data.outcomes){if(outcome.customerId!==customerId)throw new Error('HubSpot account binding mismatch');const result=await reconcileOutcome(actor,outcome);if(result.status==='created')created++;else if(result.status==='corrected')corrected++;else duplicates++;}
  return {created,corrected,duplicates,skipped:data.skipped};
 });
}
