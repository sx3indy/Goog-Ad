import './env';
import {deploymentProblems,DeploymentTarget} from '../src/core/deployment';
import {pool,tenantTransaction} from '../src/server/db';
import {googleAdsFromEnvironment} from '../src/server/integrations/google-ads';
import {hubspotBusinessFromEnvironment} from '../src/server/integrations/hubspot-business';
import {Actor} from '../src/core/contracts';
const target=process.argv[2];if(target!=='web'&&target!=='worker')throw new Error('Usage: npm run deploy:check -- web|worker');
const problems=deploymentProblems(target as DeploymentTarget,process.env);
if(!process.versions.node.startsWith('24.'))problems.push('Node.js 24 is required');
if(!problems.length){
 try{
  const role=(await pool().query('SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user')).rows[0];
  if(role.rolsuper||role.rolbypassrls||role.rolcreaterole||role.rolcreatedb)problems.push('Database application role has excessive privileges');
  const schema=await pool().query("SELECT version FROM schema_migrations WHERE version='009_account_reporting'");if(!schema.rowCount)problems.push('Database migrations are pending');
  if(target==='worker'){
   const actor:Actor={tenantId:process.env.GOOGLE_ADS_TENANT_ID!,userId:'service:deployment-check',role:'owner'};
   const ids=process.env.GOOGLE_ADS_CUSTOMER_IDS!.split(',').map(id=>id.trim());
   await tenantTransaction(actor,async c=>{const accounts=(await c.query('SELECT customer_id,currency FROM ad_accounts WHERE customer_id=ANY($1::text[])',[ids])).rows;if(accounts.length!==new Set(ids).size)throw new Error('Scoped account provisioning missing');const bound=accounts.find(a=>a.customer_id===process.env.HUBSPOT_CUSTOMER_ID);if(bound?.currency!==process.env.HUBSPOT_CURRENCY)throw new Error('CRM currency binding mismatch');});
  }
 }catch{problems.push('Database connectivity, verified TLS, role or scoped provisioning check failed');}
 if(target==='worker'&&!problems.length){
  const actor:Actor={tenantId:process.env.GOOGLE_ADS_TENANT_ID!,userId:'service:deployment-check',role:'owner'};
  try{for(const id of process.env.GOOGLE_ADS_CUSTOMER_IDS!.split(',').map(id=>id.trim())){const rows=await googleAdsFromEnvironment(false).search(actor,id,'SELECT customer.id, customer.currency_code FROM customer LIMIT 1');if(rows.length!==1)throw new Error('Customer unavailable');}}catch{problems.push('Google Ads read-only account access check failed');}
  try{await hubspotBusinessFromEnvironment().verifySchema(actor);}catch{problems.push('HubSpot account, stage, property or permission verification failed');}
 }
 await pool().end();
}
console.log(JSON.stringify({status:problems.length?'blocked':'passed',target,problems,liveWritesCertified:false},null,2));
if(problems.length)process.exitCode=1;
