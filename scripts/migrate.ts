import './env';
import { Client } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
if(!process.env.ADMIN_DATABASE_URL) throw new Error('ADMIN_DATABASE_URL required for migrations');
const c=new Client({connectionString:process.env.ADMIN_DATABASE_URL});await c.connect();
try{
 await c.query('SELECT pg_advisory_lock(928462)');
 await c.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
 for(const f of readdirSync('db').filter(f=>f.endsWith('.sql')).sort()){
  const version=f.replace('.sql','');if((await c.query('SELECT 1 FROM schema_migrations WHERE version=$1',[version])).rowCount)continue;
  await c.query('BEGIN');try{await c.query(readFileSync(`db/${f}`,'utf8'));await c.query('COMMIT');console.log(`Applied ${version}`);}catch(e){await c.query('ROLLBACK');throw e;}
 }
}finally{await c.query('SELECT pg_advisory_unlock(928462)');await c.end();}
