import './env';
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { PolicySchema } from '../src/core/contracts';
const schema=z.object({tenantId:z.uuid(),tenantName:z.string().min(1).max(100),clerkOrganizationId:z.string().regex(/^org_[a-zA-Z0-9]+$/),ownerClerkUserId:z.string().regex(/^user_[a-zA-Z0-9]+$/),customerId:z.string().regex(/^\d{10}$/),accountName:z.string().min(1).max(100),currency:z.string().regex(/^[A-Z]{3}$/),timezone:z.string(),policy:PolicySchema}).strict();
const file=process.argv[2];if(!file)throw new Error('Usage: npm run provision -- /secure/path/tenant.json');
if(process.env.APP_MODE!=='live')throw new Error('Provisioning requires explicit live mode and separate administrative credentials');
const input=schema.parse(JSON.parse(readFileSync(file,'utf8')));new Intl.DateTimeFormat('en-US',{timeZone:input.timezone}).format(new Date());
if(!['L0','L1','L2'].includes(input.policy.autonomy))throw new Error('Provisioning cannot bypass autonomy graduation');
const c=new Client({connectionString:process.env.ADMIN_DATABASE_URL});await c.connect();
try{
 await c.query('BEGIN');
 if((await c.query('SELECT id FROM tenants WHERE id=$1',[input.tenantId])).rowCount)throw new Error('Tenant already provisioned; use a reviewed migration for membership changes');
 const existing=(await c.query('SELECT id FROM users WHERE clerk_id=$1',[input.ownerClerkUserId])).rows[0];const userId=existing?.id??crypto.randomUUID();
 if(!existing)await c.query('INSERT INTO users(id,clerk_id,display_name) VALUES($1,$2,$3)',[userId,input.ownerClerkUserId,'Account owner']);
 await c.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[input.tenantId,input.tenantName]);
 await c.query('INSERT INTO tenant_identities(clerk_org_id,tenant_id) VALUES($1,$2)',[input.clerkOrganizationId,input.tenantId]);
 await c.query("INSERT INTO memberships(tenant_id,id,user_id,role) VALUES($1,$2,$3,'owner')",[input.tenantId,crypto.randomUUID(),userId]);
 await c.query("INSERT INTO ad_accounts(tenant_id,id,customer_id,name,currency,timezone,connection_status) VALUES($1,$2,$3,$4,$5,$6,'pending')",[input.tenantId,crypto.randomUUID(),input.customerId,input.accountName,input.currency,input.timezone]);
 await c.query('INSERT INTO account_policies(tenant_id,id,customer_id,version,document) VALUES($1,$2,$3,$4,$5)',[input.tenantId,crypto.randomUUID(),input.customerId,input.policy.version,input.policy]);
 await c.query('INSERT INTO account_controls(tenant_id,id,customer_id,current_policy_version,killed) VALUES($1,$2,$3,$4,$5)',[input.tenantId,crypto.randomUUID(),input.customerId,input.policy.version,input.policy.killed]);
 await c.query('INSERT INTO audit_events(tenant_id,id,actor_id,event_type,resource_id,details) VALUES($1,$2,$3,$4,$5,$6)',[input.tenantId,crypto.randomUUID(),'administrative-provisioner','tenant.provisioned',input.tenantId,{customerId:input.customerId,policyVersion:input.policy.version}]);
 await c.query('COMMIT');console.log(JSON.stringify({status:'provisioned',tenantId:input.tenantId,customerId:input.customerId}));
}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
