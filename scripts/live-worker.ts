import './env';
import { startTelemetry } from '../src/server/telemetry-node';
import { Actor } from '../src/core/contracts';
import { googleAdsFromEnvironment } from '../src/server/integrations/google-ads';
import { hubspotBusinessFromEnvironment } from '../src/server/integrations/hubspot-business';
import { runExternal } from '../src/server/external-executor';
import { ingestAds,ingestHubSpot } from '../src/server/ingestion';
import { pool } from '../src/server/db';
import { logEvent,traced } from '../src/server/observability';
import { enqueueSync,runIntegrationJob,Provider } from '../src/server/jobs';
import { GA4Client,BigQueryClient } from '../src/server/integrations/google-analytics';
import { ingestAnalytics,exportWarehouse } from '../src/server/analytics';
import { ClaudeModel,GeminiModel } from '../src/server/integrations/models';
import { generateModelProposals } from '../src/server/model-service';
import { ProposalModel } from '../src/core/intelligence';
if(process.env.APP_MODE!=='live')throw new Error('Live worker requires explicit live mode');
if(!['direct','session'].includes(process.env.DB_CONNECTION_MODE??''))throw new Error('Worker requires a direct or session-pooled database connection for advisory locks');
await startTelemetry('ados-worker');
const tenantId=process.env.GOOGLE_ADS_TENANT_ID;if(!tenantId)throw new Error('Worker tenant binding missing');
const actor:Actor={tenantId,userId:'service:integrations-worker',role:'owner'};
const readAdapter=googleAdsFromEnvironment(false),writeAdapter=googleAdsFromEnvironment(process.env.GOOGLE_ADS_WRITES_ENABLED==='true');
const ids=process.env.GOOGLE_ADS_CUSTOMER_IDS!.split(',').map(id=>id.trim());
let hubspot:ReturnType<typeof hubspotBusinessFromEnvironment>|null=null;
if(process.env.HUBSPOT_PRIVATE_APP_TOKEN)try{hubspot=hubspotBusinessFromEnvironment();}catch{logEvent('hubspot.configuration.invalid');}
const handlers:Partial<Record<Provider,(customerId:string,key:string)=>Promise<unknown>>>={google_ads:(id,key)=>ingestAds(actor,id,readAdapter,key)};
if(hubspot)handlers.hubspot=(id,key)=>{if(process.env.HUBSPOT_CUSTOMER_ID!==id||process.env.HUBSPOT_TENANT_ID!==tenantId)throw new Error('HubSpot account binding mismatch');return ingestHubSpot(actor,id,hubspot!,key);};
if(process.env.GA4_PROPERTY_ID)try{
 const analytics=new GA4Client({tenantId:process.env.GA4_TENANT_ID??'',propertyId:process.env.GA4_PROPERTY_ID,customerId:process.env.GA4_CUSTOMER_ID??''});
 handlers.ga4=(id,key)=>{if(process.env.GA4_CUSTOMER_ID!==id)throw new Error('Analytics customer binding mismatch');return ingestAnalytics(actor,id,analytics,key);};
}catch{logEvent('ga4.configuration.invalid');}
if(process.env.BIGQUERY_PROJECT_ID)try{
 const warehouse=new BigQueryClient({tenantId:process.env.BIGQUERY_TENANT_ID??'',projectId:process.env.BIGQUERY_PROJECT_ID,dataset:process.env.BIGQUERY_DATASET??'',table:'audit_facts'});
 handlers.warehouse=()=>exportWarehouse(actor,warehouse);
}catch{logEvent('warehouse.configuration.invalid');}
const models:ProposalModel[]=[];
if(process.env.ANTHROPIC_API_KEY&&process.env.ANTHROPIC_MODEL)try{models.push(new ClaudeModel({apiKey:process.env.ANTHROPIC_API_KEY,model:process.env.ANTHROPIC_MODEL}));}catch{logEvent('claude.configuration.invalid');}
if(process.env.GEMINI_API_KEY&&process.env.GEMINI_MODEL)try{models.push(new GeminiModel({apiKey:process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL}));}catch{logEvent('gemini.configuration.invalid');}
if(models.length)handlers.models=async id=>{const results=[];for(const model of models)results.push(await generateModelProposals(actor,id,model));return {results};};
let stopping=false,lastIngestion=0;
process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
logEvent('worker.started',{mode:'live',writesConfigured:process.env.GOOGLE_ADS_WRITES_ENABLED==='true'});
while(!stopping){
 if(Date.now()-lastIngestion>=900000){
  lastIngestion=Date.now();
  for(const customerId of ids){if(stopping)break;for(const provider of ['google_ads','hubspot','ga4','warehouse'] as const){if(!handlers[provider])continue;if(provider==='hubspot'&&process.env.HUBSPOT_CUSTOMER_ID!==customerId)continue;if(provider==='ga4'&&process.env.GA4_CUSTOMER_ID!==customerId)continue;try{await enqueueSync(actor,customerId,provider);}catch{logEvent('integration.enqueue.unavailable',{customerId,provider});}}
  }
 }
 try{const result=await traced('integration.job',{},()=>runIntegrationJob(actor,handlers));if(result)logEvent('integration.job.finished',{id:result.id,status:result.status});}catch{logEvent('integration.job.unavailable');}
 if(process.env.GOOGLE_ADS_WRITES_ENABLED==='true'&&process.env.GOOGLE_ADS_VALIDATE_ONLY==='false')try{const result=await runExternal(actor,writeAdapter,process.env.GOOGLE_ADS_API_VERSION!);if(result)logEvent('worker.command',{id:result.id,status:result.status});}catch{logEvent('worker.command.unavailable');}
 await new Promise(r=>setTimeout(r,1000));
}
await pool().end();logEvent('worker.stopped');
