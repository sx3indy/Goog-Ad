import './env';
import { Client } from 'pg';
import { DEMO_TENANT,DEMO_USER } from '../src/core/contracts';
import { createFixture } from './fixtures';
if(process.env.APP_MODE!=='demo')throw new Error('Demo seeding disabled outside demo mode');
const c=new Client({connectionString:process.env.ADMIN_DATABASE_URL});await c.connect();
try{
 await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(928463)');
 if(!(await c.query('SELECT id FROM tenants WHERE id=$1',[DEMO_TENANT])).rowCount){await createFixture(c,{tenantId:DEMO_TENANT,userId:DEMO_USER,role:'owner'});console.log('Created synthetic demo fixtures');}else console.log('Demo already seeded; preserved existing state');
 await c.query('COMMIT');
}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
