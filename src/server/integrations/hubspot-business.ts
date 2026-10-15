import { z } from 'zod';
import { Actor } from '../../core/contracts';
import { HubSpotClient,HubSpotMapping } from './hubspot';
import { jsonRequest,Transport } from './http';
export class HubSpotBusinessClient {
 constructor(private binding:{tenantId:string;customerId:string;token:string;currency:string;accountId:string;pipelineId?:string;currencyProperty?:string},private transport:Transport=fetch){
  z.uuid().parse(binding.tenantId);z.string().regex(/^\d{10}$/).parse(binding.customerId);z.string().regex(/^\d+$/).parse(binding.accountId);z.string().min(1).parse(binding.token);z.string().regex(/^[A-Z]{3}$/).parse(binding.currency);
 }
 async verifySchema(actor:Actor){
  if(actor.tenantId!==this.binding.tenantId)throw new Error('HubSpot business scope denied');
  const account=await jsonRequest('HubSpot','https://api.hubapi.com/account-info/v3/details',{method:'GET',headers:{Authorization:`Bearer ${this.binding.token}`}},this.transport);
  const portal=z.object({portalId:z.union([z.number().int().positive(),z.string().regex(/^\d+$/)])}).parse(account.body);
  if(String(portal.portalId)!==this.binding.accountId)throw new Error('HubSpot token belongs to a different account');
  const response=await jsonRequest('HubSpot','https://api.hubapi.com/crm/v3/pipelines/deals',{method:'GET',headers:{Authorization:`Bearer ${this.binding.token}`}},this.transport);
  const pipelines=z.object({results:z.array(z.object({id:z.string(),stages:z.array(z.object({id:z.string(),label:z.string()}))}))}).parse(response.body).results;
  const selected=pipelines.filter(p=>!this.binding.pipelineId||p.id===this.binding.pipelineId);
  function stageId(label:string){const matches=selected.flatMap(p=>p.stages).filter(s=>s.label.toLowerCase()===label.toLowerCase());if(matches.length!==1)throw new Error(`HubSpot stage '${label}' is missing or ambiguous; select a pipeline`);return matches[0].id;}
  const moveIn=stageId('Move-In Completed'),paid=stageId('Payment Received');
  const contact:HubSpotMapping={objectType:'contacts',stageProperty:'lifecyclestage',stageMap:{salesqualifiedlead:'qualified'},currency:this.binding.currency,paidEvidence:'confirmation_property'};
  const deals:HubSpotMapping={objectType:'deals',stageProperty:'dealstage',stageMap:{[moveIn]:'move_in',[paid]:'paid'},paidRevenueProperty:'referral_payout_amount',paymentDateProperty:'referral_payment_date',costProperty:'actual_delivery_cost',currencyProperty:this.binding.currencyProperty??'deal_currency_code',currency:this.binding.currency,paidEvidence:'payment_received_stage'};
  const clients=[new HubSpotClient(this.binding,contact,this.transport),new HubSpotClient(this.binding,deals,this.transport)];
  const contactProps=await clients[0].propertyDefinitions(actor),dealProps=await clients[1].propertyDefinitions(actor);
  if(!contactProps.results.some(p=>p.name==='lifecyclestage'&&p.options?.some(o=>o.value==='salesqualifiedlead')))throw new Error('Sales Qualified Lead lifecycle option unverified');
  for(const name of ['referral_payout_amount','referral_payment_date','actual_delivery_cost',deals.currencyProperty!])if(!dealProps.results.some(p=>p.name===name))throw new Error(`Required HubSpot property unavailable: ${name}`);
  return clients;
 }
 async outcomes(actor:Actor){
  const clients=await this.verifySchema(actor);
  const results=[];for(const client of clients)results.push(await client.outcomes(actor));
  return {outcomes:results.flatMap(r=>r.outcomes),skipped:results.reduce((n,r)=>n+r.skipped,0)};
 }
}
export function hubspotBusinessFromEnvironment(){return new HubSpotBusinessClient({tenantId:process.env.HUBSPOT_TENANT_ID??'',customerId:process.env.HUBSPOT_CUSTOMER_ID??'',token:process.env.HUBSPOT_PRIVATE_APP_TOKEN??'',currency:process.env.HUBSPOT_CURRENCY??'',accountId:process.env.HUBSPOT_ACCOUNT_ID??'',pipelineId:process.env.HUBSPOT_PIPELINE_ID||undefined,currencyProperty:process.env.HUBSPOT_CURRENCY_PROPERTY||undefined});}
