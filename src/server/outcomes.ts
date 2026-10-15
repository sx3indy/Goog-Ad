import { z } from 'zod';
import { Actor } from '../core/contracts';
import { AppError, audit, requireRole, tenantTransaction } from './db';
export const OutcomeSchema=z.object({customerId:z.string().regex(/^\d{10}$/),externalId:z.string().min(1).max(160),stage:z.enum(['inquiry','qualified','tour','move_in','paid','canceled']),finalized:z.boolean(),revenueMicros:z.string().regex(/^(0|[1-9]\d{0,17})$/),costMicros:z.string().regex(/^(0|[1-9]\d{0,17})$/),currency:z.string().regex(/^[A-Z]{3}$/),eventTime:z.iso.datetime(),sourceUpdatedAt:z.iso.datetime().optional(),correction:z.boolean().default(false)}).strict();
export async function reconcileOutcome(actor:Actor,input:unknown){
 requireRole(actor,['owner','analyst']);const o=OutcomeSchema.parse(input);
 if(o.stage!=='paid'&&o.revenueMicros!=='0')throw new AppError(422,'Revenue is recognized only for paid outcomes');
 if(o.stage==='paid'&&!o.finalized)throw new AppError(422,'Paid revenue must be finalized');
 if(Date.parse(o.eventTime)>Date.now())throw new AppError(422,'Outcome event time is in the future');
 const sourceUpdatedAt=o.sourceUpdatedAt??o.eventTime;if(Date.parse(sourceUpdatedAt)>Date.now())throw new AppError(422,'Source revision time is in the future');
 return tenantTransaction(actor,async c=>{
  const account=(await c.query('SELECT currency FROM ad_accounts WHERE customer_id=$1',[o.customerId])).rows[0];
  if(!account)throw new AppError(404,'Account not found');if(account.currency!==o.currency)throw new AppError(422,'Currency mismatch');
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${actor.tenantId}:outcome:${o.externalId}`]);
  const old=(await c.query('SELECT * FROM crm_outcomes WHERE external_id=$1 FOR UPDATE',[o.externalId])).rows[0];
  if(old){
   if(old.customer_id!==o.customerId)throw new AppError(409,'External ID belongs to another account');
   const same=old.stage===o.stage&&old.finalized===o.finalized&&old.revenue_micros===o.revenueMicros&&old.cost_micros===o.costMicros&&old.event_time.toISOString()===o.eventTime;
   const priorRevision=(old.source_updated_at??old.event_time).getTime();
   if(same){if(Date.parse(sourceUpdatedAt)>priorRevision)await c.query('UPDATE crm_outcomes SET source_updated_at=$1 WHERE id=$2',[sourceUpdatedAt,old.id]);return {id:old.id,status:'duplicate'};}
   if(!o.correction||Date.parse(sourceUpdatedAt)<=priorRevision)throw new AppError(409,'Conflicting or out-of-order outcome; explicit newer correction required');
   await c.query('UPDATE crm_outcomes SET stage=$1,finalized=$2,revenue_micros=$3,cost_micros=$4,event_time=$5,source_updated_at=$6,ingested_at=now() WHERE id=$7',[o.stage,o.finalized,o.revenueMicros,o.costMicros,o.eventTime,sourceUpdatedAt,old.id]);
   await audit(c,actor,'outcome.corrected',old.id,{externalId:o.externalId,before:{stage:old.stage,revenueMicros:old.revenue_micros,costMicros:old.cost_micros},after:{stage:o.stage,revenueMicros:o.revenueMicros,costMicros:o.costMicros},eventTime:o.eventTime});return {id:old.id,status:'corrected'};
  }
  const id=crypto.randomUUID();await c.query('INSERT INTO crm_outcomes(tenant_id,id,customer_id,external_id,stage,finalized,revenue_micros,cost_micros,currency,event_time,source_updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[actor.tenantId,id,o.customerId,o.externalId,o.stage,o.finalized,o.revenueMicros,o.costMicros,o.currency,o.eventTime,sourceUpdatedAt]);
  await audit(c,actor,'outcome.ingested',id,{externalId:o.externalId,stage:o.stage,eventTime:o.eventTime});return {id,status:'created'};
 });
}
