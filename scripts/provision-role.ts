import './env';
import {Client} from 'pg';
if(process.env.APP_MODE!=='live')throw new Error('Production role provisioning requires explicit live mode');
function checkedUrl(value:string|undefined,label:string){try{return new URL(value??'');}catch{throw new Error(`${label} is missing or invalid`);}}
const adminUrl=checkedUrl(process.env.ADMIN_DATABASE_URL,'ADMIN_DATABASE_URL'),appUrl=checkedUrl(process.env.DATABASE_URL,'DATABASE_URL');
if(!['postgres:','postgresql:'].includes(adminUrl.protocol)||adminUrl.searchParams.get('sslmode')!=='verify-full'||appUrl.searchParams.get('sslmode')!=='verify-full')throw new Error('Administrative and application database connections require verified TLS');
if(adminUrl.hostname!==appUrl.hostname||adminUrl.port!==appUrl.port||adminUrl.pathname!==appUrl.pathname)throw new Error('Administrative and application URLs must target the same database endpoint');
if(appUrl.username!=='ads_app'||adminUrl.username==='ads_app'||!appUrl.password)throw new Error('Use separate administrative and ads_app database credentials');
const admin=new Client({connectionString:process.env.ADMIN_DATABASE_URL});
try{
 await admin.connect();await admin.query('BEGIN');
 await admin.query('SELECT pg_advisory_xact_lock(928463)');
 const role=(await admin.query("SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolcanlogin FROM pg_roles WHERE rolname='ads_app'")).rows[0];
 if(role){if(role.rolsuper||role.rolbypassrls||role.rolcreatedb||role.rolcreaterole||!role.rolcanlogin)throw new Error('Existing application role is overprivileged or cannot log in');}
 else{
  await admin.query("SELECT set_config('ados.bootstrap_password',$1,true)",[decodeURIComponent(appUrl.password)]);
  await admin.query("DO $$ BEGIN EXECUTE format('CREATE ROLE ads_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',current_setting('ados.bootstrap_password')); END $$");
 }
 await admin.query('COMMIT');
 const app=new Client({connectionString:process.env.DATABASE_URL});try{await app.connect();await app.query('SELECT 1');}finally{await app.end();}
 console.log(JSON.stringify({status:'verified',role:'ads_app',existingRolePreserved:!!role}));
}catch{try{await admin.query('ROLLBACK');}catch{}console.error('Application role provisioning or credential verification failed; inspect administrative database access');process.exitCode=1;}finally{await admin.end();}
