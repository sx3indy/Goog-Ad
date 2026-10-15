import { Actor } from '../core/contracts';
import { tenantTransaction,audit } from './db';
import { GA4Client,BigQueryClient } from './integrations/google-analytics';
import { ingestionRun } from './ingestion';
export async function ingestAnalytics(actor:Actor,customerId:string,client:GA4Client,key:string){
 return ingestionRun(actor,customerId,'ga4',key,async()=>{
  const end=new Date(Date.now()-86400000).toISOString().slice(0,10),start=new Date(Date.now()-7*86400000).toISOString().slice(0,10);
  const report=await client.report(actor,start,end);
  await tenantTransaction(actor,c=>c.query('INSERT INTO analytics_reports(tenant_id,id,customer_id,provider,start_date,end_date,report) VALUES($1,$2,$3,$4,$5,$6,$7)',[actor.tenantId,crypto.randomUUID(),customerId,'ga4',start,end,{rows:report,businessAttribution:'unverified'}]));return {rows:report.length,start,end};
 });
}
export async function exportWarehouse(actor:Actor,client:BigQueryClient){
 // This is at-least-once delivery. Curated warehouse views MUST deduplicate stable event IDs.
 const rows=await tenantTransaction(actor,async c=>(await c.query('SELECT a.* FROM warehouse_outbox o JOIN audit_events a ON a.id=o.event_id AND a.tenant_id=o.tenant_id WHERE o.exported_at IS NULL ORDER BY o.created_at LIMIT 500')).rows);
 if(!rows.length)return {exported:0};
 await client.insert(actor,rows.map(r=>({id:r.id,event:{event_id:r.id,tenant_id:actor.tenantId,event_type:r.event_type,resource_id:r.resource_id,event_time:r.created_at.toISOString(),ingestion_time:new Date().toISOString(),payload:JSON.stringify(r.details)}})));
 await tenantTransaction(actor,async c=>{await c.query('UPDATE warehouse_outbox SET exported_at=now() WHERE event_id=ANY($1::uuid[])',[rows.map(r=>r.id)]);});return {exported:rows.length};
}
