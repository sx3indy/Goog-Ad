import { pool } from '@/server/db';
export const dynamic='force-dynamic';
export async function GET(){try{
 if(!['demo','live'].includes(process.env.APP_MODE??''))throw new Error('Mode not configured');
 if(process.env.APP_MODE==='live'&&(!process.env.CLERK_SECRET_KEY||!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY))throw new Error('Identity not configured');
 const role=(await pool().query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];if(role.rolsuper||role.rolbypassrls)throw new Error('Application role is overprivileged');
 const schema=await pool().query("SELECT version FROM schema_migrations WHERE version='009_account_reporting'");if(!schema.rowCount)throw new Error('Migrations pending');
 return Response.json({status:'ok',mode:process.env.APP_MODE,liveMutations:process.env.APP_MODE==='demo'?false:'account_gate_required'},{headers:{'Cache-Control':'no-store'}});
}catch{return Response.json({status:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}}
