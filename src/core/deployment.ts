import {z} from 'zod';
export type DeploymentTarget='web'|'worker';
export function deploymentProblems(target:DeploymentTarget,env:Record<string,string|undefined>){
 const problems:string[]=[];
 if(env.APP_MODE!=='live')problems.push('APP_MODE must explicitly be live');
 function required(names:string[]){for(const name of names)if(!env[name])problems.push(`${name} is missing`);}
 required(['DATABASE_URL']);
 if(env.DATABASE_URL)try{const url=new URL(env.DATABASE_URL);if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||url.username!=='ads_app'||!url.password)problems.push('DATABASE_URL must use the separately provisioned ads_app login');if(url.searchParams.get('sslmode')!=='verify-full')problems.push('DATABASE_URL requires verified TLS (sslmode=verify-full)');if(['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname))problems.push('Hosted deployment cannot use the local demonstration database');}catch{problems.push('DATABASE_URL is invalid');}
 if(env.ADMIN_DATABASE_URL)problems.push('Remove ADMIN_DATABASE_URL from the web/worker runtime; use it only for administrative provisioning');
 if(env.DB_POOL_MAX&&(!/^\d+$/.test(env.DB_POOL_MAX)||Number(env.DB_POOL_MAX)<2||Number(env.DB_POOL_MAX)>20))problems.push('DB_POOL_MAX must be from 2 through 20');
 if(target==='web'){
  required(['APP_ORIGIN','NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY','CLERK_SECRET_KEY']);
  if(env.APP_ORIGIN)try{const url=new URL(env.APP_ORIGIN);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)problems.push('APP_ORIGIN must be a canonical HTTPS origin');}catch{problems.push('APP_ORIGIN is invalid');}
 }else{
  if(!['direct','session'].includes(env.DB_CONNECTION_MODE??''))problems.push('Worker DB_CONNECTION_MODE must be direct or session; transaction pooling cannot retain resource locks');
  required(['GOOGLE_ADS_API_VERSION','GOOGLE_ADS_TENANT_ID','GOOGLE_ADS_CUSTOMER_IDS','GOOGLE_ADS_DEVELOPER_TOKEN','GOOGLE_ADS_CLIENT_ID','GOOGLE_ADS_CLIENT_SECRET','GOOGLE_ADS_REFRESH_TOKEN','HUBSPOT_ACCOUNT_ID','HUBSPOT_TENANT_ID','HUBSPOT_CUSTOMER_ID','HUBSPOT_CURRENCY','HUBSPOT_PRIVATE_APP_TOKEN']);
  if(env.GOOGLE_ADS_API_VERSION&&env.GOOGLE_ADS_API_VERSION!=='v25')problems.push('GOOGLE_ADS_API_VERSION does not match the implemented v25 contract');
  if(env.GOOGLE_ADS_TENANT_ID&&!z.uuid().safeParse(env.GOOGLE_ADS_TENANT_ID).success)problems.push('GOOGLE_ADS_TENANT_ID must be the provisioned tenant UUID');
  const ids=env.GOOGLE_ADS_CUSTOMER_IDS?.split(',').map(id=>id.trim())??[];
  if(ids.some(id=>!/^\d{10}$/.test(id)))problems.push('GOOGLE_ADS_CUSTOMER_IDS must contain unformatted customer IDs');
  if(env.HUBSPOT_TENANT_ID&&env.HUBSPOT_TENANT_ID!==env.GOOGLE_ADS_TENANT_ID)problems.push('HubSpot and Ads tenant bindings differ');
  if(env.HUBSPOT_CUSTOMER_ID&&!ids.includes(env.HUBSPOT_CUSTOMER_ID))problems.push('HUBSPOT_CUSTOMER_ID must be a scoped Google Ads account');
  if(env.HUBSPOT_ACCOUNT_ID&&!/^\d+$/.test(env.HUBSPOT_ACCOUNT_ID))problems.push('HUBSPOT_ACCOUNT_ID is invalid');
  if(env.HUBSPOT_CURRENCY&&!/^[A-Z]{3}$/.test(env.HUBSPOT_CURRENCY))problems.push('HUBSPOT_CURRENCY must be the verified account currency');
  if(env.GOOGLE_ADS_WRITES_ENABLED==='true'&&env.GOOGLE_ADS_VALIDATE_ONLY==='false')problems.push('Initial deployment must remain read-only or validate-only pending live release certification');
 }
 return problems;
}
