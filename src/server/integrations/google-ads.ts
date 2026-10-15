import { PoolClient } from 'pg';
import { z } from 'zod';
import { Actor, CampaignState, Proposal } from '../../core/contracts';
import type { AdsAdapter } from '../ads-adapter';
import { GoogleOAuth } from './google-oauth';
import { IntegrationError,jsonRequest,Transport } from './http';
const Id=z.string().regex(/^\d{10}$/);
const Config=z.object({version:z.literal('v25'),tenantId:z.uuid(),customerIds:z.array(Id).min(1),developerToken:z.string().min(1),loginCustomerId:Id.optional(),clientId:z.string().min(1),clientSecret:z.string().min(1),refreshToken:z.string().min(1),writesEnabled:z.boolean(),validateOnly:z.boolean()});
export type GoogleAdsConfig=z.infer<typeof Config>;
export class GoogleAdsAdapter implements AdsAdapter {
 readonly mode='live' as const;
 private config:GoogleAdsConfig;
 private oauth:GoogleOAuth;
 constructor(config:GoogleAdsConfig,private transport:Transport=fetch){this.config=Config.parse(config);this.oauth=new GoogleOAuth(config,transport);}
 private scope(actor:Actor,customerId:string){if(actor.tenantId!==this.config.tenantId||!this.config.customerIds.includes(customerId))throw new Error('Google Ads credential scope denied');}
 private async call(actor:Actor,customerId:string,service:string,body:unknown,mutation=false){
  this.scope(actor,customerId);
  const headers:Record<string,string>={'Content-Type':'application/json','developer-token':this.config.developerToken,Authorization:`Bearer ${await this.oauth.accessToken()}`};
  if(this.config.loginCustomerId)headers['login-customer-id']=this.config.loginCustomerId;
  return jsonRequest('Google Ads',`https://googleads.googleapis.com/${this.config.version}/customers/${customerId}/${service}`,{method:'POST',headers,body:JSON.stringify(body)},this.transport,mutation);
 }
 async search(actor:Actor,customerId:string,query:string){
  const rows:Record<string,unknown>[]=[];let pageToken:string|undefined;const seen=new Set<string>();
  for(let page=0;page<100;page++){
   const response=await this.call(actor,customerId,'googleAds:search',{query,...(pageToken?{pageToken}:{})});
   const body=z.object({results:z.array(z.record(z.string(),z.unknown())).default([]),nextPageToken:z.string().optional()}).parse(response.body);
   rows.push(...body.results);if(rows.length>100000)throw new Error('Google Ads reporting result limit exceeded');
   if(!body.nextPageToken)return rows;if(seen.has(body.nextPageToken))throw new Error('Repeated Google Ads page token');seen.add(body.nextPageToken);pageToken=body.nextPageToken;
  }throw new Error('Google Ads reporting page limit exceeded');
 }
 async read(_c:PoolClient|null,actor:Actor,customerId:string,resourceName:string):Promise<CampaignState>{
  if(!new RegExp(`^customers/${customerId}/campaigns/[0-9]+$`).test(resourceName))throw new Error('Campaign target invalid');
  const campaignId=resourceName.split('/').at(-1)!;
  const rows=await this.search(actor,customerId,`SELECT campaign.resource_name, campaign.status, campaign.campaign_budget, campaign_budget.amount_micros, campaign_budget.explicitly_shared FROM campaign WHERE campaign.id = ${campaignId}`);
  if(rows.length!==1)throw new Error('Expected one accessible campaign');
  const parsed=z.object({campaign:z.object({resourceName:z.literal(resourceName),status:z.enum(['ENABLED','PAUSED']),campaignBudget:z.string().regex(new RegExp(`^customers/${customerId}/campaignBudgets/[0-9]+$`))}),campaignBudget:z.object({amountMicros:z.string().regex(/^\d{1,18}$/),explicitlyShared:z.boolean().default(false)})}).parse(rows[0]);
  return {status:parsed.campaign.status,budgetMicros:parsed.campaignBudget.amountMicros,budgetResourceName:parsed.campaign.campaignBudget,sharedBudget:parsed.campaignBudget.explicitlyShared};
 }
 async mutate(c:PoolClient|null,actor:Actor,p:Proposal,mask:string[]){
  if(!this.config.writesEnabled)throw new Error('Live Google Ads mutations disabled');
  if(this.config.validateOnly)throw new Error('Validation-only adapter cannot execute commands');
  const current=await this.read(c,actor,p.customerId,p.resourceName);
  let service:string,operation:unknown;
  if(p.action==='PAUSE_CAMPAIGN'){
   if(mask.join()!=='status'||p.mutation.before.status!==current.status||p.mutation.after.status!=='PAUSED')throw new Error('Pause precondition failed');
   service='campaigns:mutate';operation={update:{resourceName:p.resourceName,status:'PAUSED'},updateMask:'status'};
  }else if(p.action==='UPDATE_BUDGET'){
   if(current.sharedBudget||mask.join()!=='budgetMicros'||p.mutation.before.budgetResourceName!==current.budgetResourceName||p.mutation.before.budgetMicros!==current.budgetMicros)throw new Error('Budget resource precondition failed');
   const after=z.string().regex(/^\d{1,18}$/).parse(p.mutation.after.budgetMicros);if(BigInt(after)<=0n||BigInt(after)>=BigInt(current.budgetMicros))throw new Error('Only positive budget reductions are enabled');
   service='campaignBudgets:mutate';operation={update:{resourceName:current.budgetResourceName,amountMicros:after},updateMask:'amountMicros'};
  }else throw new Error('Live mutation type unsupported');
  const response=await this.call(actor,p.customerId,service,{operations:[operation],partialFailure:false,validateOnly:this.config.validateOnly},true);
  const result=z.object({results:z.array(z.object({resourceName:z.string()})),partialFailureError:z.unknown().optional()}).parse(response.body);
  if(result.partialFailureError||result.results.length!==1)throw new IntegrationError('Google Ads',502,false,true,response.requestId);
  return {requestId:response.requestId};
 }
}
export function googleAdsFromEnvironment(writesEnabled=false){
 const config=Config.safeParse({version:process.env.GOOGLE_ADS_API_VERSION,tenantId:process.env.GOOGLE_ADS_TENANT_ID,customerIds:process.env.GOOGLE_ADS_CUSTOMER_IDS?.split(',').map(s=>s.trim()),developerToken:process.env.GOOGLE_ADS_DEVELOPER_TOKEN,loginCustomerId:process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID||undefined,clientId:process.env.GOOGLE_ADS_CLIENT_ID,clientSecret:process.env.GOOGLE_ADS_CLIENT_SECRET,refreshToken:process.env.GOOGLE_ADS_REFRESH_TOKEN,writesEnabled,validateOnly:process.env.GOOGLE_ADS_VALIDATE_ONLY!=='false'});
 if(!config.success)throw new Error('Google Ads access disabled: configuration incomplete or API version not validated');return new GoogleAdsAdapter(config.data);
}
