import { z } from 'zod';
import { Actor } from '../../core/contracts';
import { jsonRequest,Transport } from './http';
import { OutcomeSchema } from '../outcomes';
const Stage=z.enum(['inquiry','qualified','tour','move_in','paid','canceled']);
const Property=z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/);
const Mapping=z.object({objectType:z.enum(['contacts','deals']),stageProperty:Property,stageMap:z.record(z.string(),Stage),paidConfirmationProperty:Property.optional(),paidRevenueProperty:Property.optional(),paymentDateProperty:Property.optional(),costProperty:Property.optional(),currencyProperty:Property.optional(),currency:z.string().regex(/^[A-Z]{3}$/),paidEvidence:z.enum(['confirmation_property','payment_received_stage']).default('confirmation_property')}).strict().refine(m=>!Object.values(m.stageMap).includes('paid')||!!m.paidRevenueProperty,'Paid stage mappings require a collected revenue property');
export type HubSpotMapping=z.infer<typeof Mapping>;
const ObjectSchema=z.object({id:z.string().regex(/^\d+$/),updatedAt:z.iso.datetime(),archived:z.boolean().optional(),properties:z.record(z.string(),z.string().nullable()),propertiesWithHistory:z.record(z.string(),z.array(z.object({value:z.string(),timestamp:z.iso.datetime()}))).optional()});
export function hubspotDate(value:string){if(!/^\d{13}$/.test(value)&&!z.union([z.iso.date(),z.iso.datetime({offset:true})]).safeParse(value).success)throw new Error('HubSpot event date invalid');const millis=/^\d{13}$/.test(value)?Number(value):Date.parse(value);if(!Number.isFinite(millis))throw new Error('HubSpot event date invalid');return new Date(millis).toISOString();}
export function decimalMicros(value:string){
 if(!/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/.test(value))throw new Error('Financial amount is not a nonnegative decimal with micros precision');
 const [whole,fraction='']=value.split('.');return (BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'))).toString();
}
export class HubSpotClient {
 private mapping:HubSpotMapping;
 constructor(private binding:{tenantId:string;customerId:string;token:string;accountId?:string},mapping:HubSpotMapping,private transport:Transport=fetch){z.uuid().parse(binding.tenantId);z.string().regex(/^\d{10}$/).parse(binding.customerId);if(!binding.token)throw new Error('HubSpot token missing');if(binding.accountId)z.string().regex(/^\d+$/).parse(binding.accountId);this.mapping=Mapping.parse(mapping);}
 private scope(actor:Actor){if(actor.tenantId!==this.binding.tenantId)throw new Error('HubSpot credential scope denied');}
 async outcomes(actor:Actor){
  this.scope(actor);const m=this.mapping,properties=[m.stageProperty,...(m.paidRevenueProperty?[m.paidRevenueProperty]:[]),...(m.paidConfirmationProperty?[m.paidConfirmationProperty]:[]),...(m.paymentDateProperty?[m.paymentDateProperty]:[]),...(m.costProperty?[m.costProperty]:[]),...(m.currencyProperty?[m.currencyProperty]:[])];
  const rows:z.infer<typeof OutcomeSchema>[]=[];let after:string|undefined;const seen=new Set<string>();let skipped=0;
  for(let page=0;page<100;page++){
   const url=new URL(`https://api.hubapi.com/crm/v3/objects/${m.objectType}`);url.searchParams.set('limit','100');url.searchParams.set('archived','false');url.searchParams.set('properties',properties.join(','));url.searchParams.set('propertiesWithHistory',m.stageProperty);if(after)url.searchParams.set('after',after);
   const response=await jsonRequest('HubSpot',url.href,{method:'GET',headers:{Authorization:`Bearer ${this.binding.token}`}},this.transport);
   const result=z.object({results:z.array(ObjectSchema),paging:z.object({next:z.object({after:z.string()}).optional()}).optional()}).parse(response.body);
   for(const o of result.results){
    if(o.archived){skipped++;continue;}const stage=m.stageMap[o.properties[m.stageProperty]??''];if(!stage){skipped++;continue;}
    // Won/closed does not establish paid revenue. Collection requires explicit confirmation or the verified Payment Received stage.
    if(stage==='paid' && m.paidEvidence==='confirmation_property' && (!m.paidConfirmationProperty||o.properties[m.paidConfirmationProperty]!=='true')) {skipped++;continue;}
    const revenue=stage==='paid'?(m.paidRevenueProperty?o.properties[m.paidRevenueProperty]:undefined): '0';if(revenue==null)throw new Error('Paid HubSpot outcome has no collected revenue');
    if(stage==='paid'&&(!m.costProperty||o.properties[m.costProperty]==null))throw new Error('Paid contribution reporting requires an explicit known cost property');
    const cost=m.costProperty?o.properties[m.costProperty]??'0':'0';
    if(m.currencyProperty&&o.properties[m.currencyProperty]!==m.currency)throw new Error('HubSpot source currency is missing or differs from the account; currency conversion is not implemented');
    const history=o.propertiesWithHistory?.[m.stageProperty]?.filter(h=>m.stageMap[h.value]===stage).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
    const payment=m.paymentDateProperty?o.properties[m.paymentDateProperty]:null;
    if(stage==='paid'&&m.paymentDateProperty&&!payment)throw new Error('Collected outcome missing referral payment date');
    const eventTime=stage==='paid'&&payment?hubspotDate(payment):history?.[0]?.timestamp??o.updatedAt;
    rows.push(OutcomeSchema.parse({customerId:this.binding.customerId,externalId:`hubspot:${this.binding.accountId?this.binding.accountId+':':''}${m.objectType}:${o.id}`,stage,finalized:true,revenueMicros:decimalMicros(revenue),costMicros:decimalMicros(cost),currency:m.currency,eventTime,sourceUpdatedAt:o.updatedAt,correction:true}));
   }
   const next=result.paging?.next?.after;if(!next)return {outcomes:rows,skipped};if(seen.has(next))throw new Error('Repeated HubSpot page cursor');seen.add(next);after=next;
  }throw new Error('HubSpot pagination limit exceeded; ingestion incomplete');
 }
 async propertyDefinitions(actor:Actor){this.scope(actor);const r=await jsonRequest('HubSpot',`https://api.hubapi.com/crm/v3/properties/${this.mapping.objectType}`,{method:'GET',headers:{Authorization:`Bearer ${this.binding.token}`}},this.transport);return z.object({results:z.array(z.object({name:z.string(),label:z.string(),options:z.array(z.object({label:z.string(),value:z.string()})).optional()}))}).parse(r.body);}
}
export function hubspotFromEnvironment(){
 let mapping:unknown;try{mapping=JSON.parse(process.env.HUBSPOT_STAGE_MAP??'');}catch{throw new Error('HUBSPOT_STAGE_MAP is missing or invalid');}
 const binding={tenantId:process.env.HUBSPOT_TENANT_ID??'',customerId:process.env.HUBSPOT_CUSTOMER_ID??'',token:process.env.HUBSPOT_PRIVATE_APP_TOKEN??'',accountId:process.env.HUBSPOT_ACCOUNT_ID||undefined};
 return new HubSpotClient(binding,Mapping.parse(mapping));
}
