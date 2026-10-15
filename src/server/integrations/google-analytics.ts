import { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';
import { Actor } from '../../core/contracts';
import { jsonRequest,Transport } from './http';
export interface TokenProvider {accessToken():Promise<string>}
export class GoogleADC implements TokenProvider {
 private auth:GoogleAuth;
 constructor(scopes:string[]){this.auth=new GoogleAuth({scopes});}
 async accessToken(){const client=await this.auth.getClient();const result=await client.getAccessToken();if(!result.token)throw new Error('Google application credentials returned no access token');return result.token;}
}
export class GA4Client {
 constructor(private config:{tenantId:string;propertyId:string;customerId:string},private tokens:TokenProvider=new GoogleADC(['https://www.googleapis.com/auth/analytics.readonly']),private transport:Transport=fetch){z.uuid().parse(config.tenantId);z.string().regex(/^\d+$/).parse(config.propertyId);z.string().regex(/^\d{10}$/).parse(config.customerId);}
 async report(actor:Actor,startDate:string,endDate:string){
  if(actor.tenantId!==this.config.tenantId)throw new Error('Analytics credential scope denied');z.iso.date().parse(startDate);z.iso.date().parse(endDate);if(startDate>endDate)throw new Error('Analytics reporting window reversed');
  const response=await jsonRequest('GA4',`https://analyticsdata.googleapis.com/v1beta/properties/${this.config.propertyId}:runReport`,{method:'POST',headers:{Authorization:`Bearer ${await this.tokens.accessToken()}`,'Content-Type':'application/json'},body:JSON.stringify({dateRanges:[{startDate,endDate}],dimensionFilter:{filter:{fieldName:'sessionGoogleAdsCustomerId',stringFilter:{matchType:'EXACT',value:this.config.customerId}}},dimensions:[{name:'date'},{name:'sessionGoogleAdsCampaignId'}],metrics:[{name:'sessions'},{name:'engagedSessions'},{name:'keyEvents'}],limit:'10000',keepEmptyRows:true})},this.transport);
  const data=z.object({rowCount:z.number().int().nonnegative().default(0),rows:z.array(z.object({dimensionValues:z.array(z.object({value:z.string()})),metricValues:z.array(z.object({value:z.string()}))})).default([]),metadata:z.object({dataLossFromOtherRow:z.boolean().optional(),subjectToThresholding:z.boolean().optional()}).optional()}).parse(response.body);
  if(data.rowCount>data.rows.length||data.metadata?.dataLossFromOtherRow||data.metadata?.subjectToThresholding)throw new Error('GA4 result incomplete, thresholded, or truncated');
  return data.rows.map(r=>{if(r.dimensionValues.length!==2||r.metricValues.length!==3)throw new Error('GA4 report shape mismatch');const numbers=r.metricValues.map(m=>Number(m.value));if(numbers.some(n=>!Number.isFinite(n)||n<0))throw new Error('GA4 metric invalid');return {date:r.dimensionValues[0].value,campaignId:r.dimensionValues[1].value,sessions:numbers[0],engagedSessions:numbers[1],keyEvents:numbers[2]};});
 }
}
export class BigQueryClient {
 constructor(private config:{tenantId:string;projectId:string;dataset:string;table:string},private tokens:TokenProvider=new GoogleADC(['https://www.googleapis.com/auth/bigquery.insertdata']),private transport:Transport=fetch){z.uuid().parse(config.tenantId);z.string().regex(/^[a-z][a-z0-9-]{4,62}$/).parse(config.projectId);z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,1023}$/).parse(config.dataset);z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,1023}$/).parse(config.table);}
 async insert(actor:Actor,rows:{id:string;event:Record<string,unknown>}[]){
  if(actor.tenantId!==this.config.tenantId)throw new Error('Warehouse credential scope denied');if(rows.length>500)throw new Error('Warehouse batch limit exceeded');
  if(rows.some(r=>r.event.tenant_id!==actor.tenantId))throw new Error('Warehouse row tenant mismatch');
  const path=`projects/${this.config.projectId}/datasets/${this.config.dataset}/tables/${this.config.table}/insertAll`;
  const response=await jsonRequest('BigQuery',`https://bigquery.googleapis.com/bigquery/v2/${path}`,{method:'POST',headers:{Authorization:`Bearer ${await this.tokens.accessToken()}`,'Content-Type':'application/json'},body:JSON.stringify({skipInvalidRows:false,ignoreUnknownValues:false,rows:rows.map(r=>({insertId:r.id,json:r.event}))})},this.transport);
  const body=z.object({insertErrors:z.array(z.object({index:z.number().int(),errors:z.array(z.record(z.string(),z.unknown()))})).optional()}).parse(response.body);
  if(body.insertErrors?.length)throw new Error('Warehouse batch contains row-level insert failures');return {inserted:rows.length};
 }
}
