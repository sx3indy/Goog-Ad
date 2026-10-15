import { PoolClient } from 'pg';
import { Actor, CampaignState, Proposal } from '../core/contracts';
import { googleAdsFromEnvironment } from './integrations/google-ads';
export class AmbiguousOutcome extends Error {}
export class RetryableFailure extends Error {}
export interface AdsAdapter {
  mode:'demo'|'live';
  read(c:PoolClient|null,actor:Actor,customerId:string,resourceName:string):Promise<CampaignState>;
  mutate(c:PoolClient|null,actor:Actor,proposal:Proposal,mask:string[]):Promise<{requestId:string|null}>;
}
export class DemoAdsAdapter implements AdsAdapter {
  mode='demo' as const;
  constructor(private fault:'none'|'timeout_after_write'|'unavailable'|'mismatch'='none'){}
  async read(c:PoolClient|null,actor:Actor,customerId:string,resourceName:string){
    if(!c)throw new Error('Demo adapter requires a tenant transaction');
    const {rows}=await c.query('SELECT state FROM demo_resource_state WHERE tenant_id=$1 AND customer_id=$2 AND resource_name=$3',[actor.tenantId,customerId,resourceName]);
    if(!rows[0])throw new Error('Resource unavailable');return rows[0].state as CampaignState;
  }
  async mutate(c:PoolClient|null,actor:Actor,p:Proposal,mask:string[]){
    if(!c)throw new Error('Demo adapter requires a tenant transaction');
    if(this.fault==='unavailable')throw new RetryableFailure('Simulated API unavailable');
    const state=await this.read(c,actor,p.customerId,p.resourceName);
    const after={...state};for(const key of mask)Object.assign(after,{[key]:p.mutation.after[key]});
    if(this.fault!=='mismatch')await c.query('UPDATE demo_resource_state SET state=$1 WHERE tenant_id=$2 AND customer_id=$3 AND resource_name=$4',[after,actor.tenantId,p.customerId,p.resourceName]);
    if(this.fault==='timeout_after_write')throw new AmbiguousOutcome('Simulated response lost after write');
    return {requestId:`demo-${crypto.randomUUID()}`};
  }
}
export function configuredAdapter():AdsAdapter{
  if(process.env.APP_MODE==='demo')return new DemoAdsAdapter();
  if(process.env.APP_MODE==='live')return googleAdsFromEnvironment(false);
  throw new Error('Live Google Ads executor is disabled without explicit validated configuration');
}
