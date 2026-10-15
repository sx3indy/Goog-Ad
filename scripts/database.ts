import './env';
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
if(process.env.APP_MODE!=='demo') throw new Error('Embedded database is for demo development only');
const dir=resolve('.local/postgres');mkdirSync(resolve('.local'),{recursive:true});
const database=new EmbeddedPostgres({databaseDir:dir,port:54329,user:'postgres',password:'local-development-only',persistent:true,authMethod:'scram-sha-256',postgresFlags:['-h','127.0.0.1','-k',resolve('.local')],onLog:()=>{},onError:console.error});
if(!existsSync(resolve(dir,'PG_VERSION'))) await database.initialise();
await database.start();
const client=new Client({connectionString:'postgresql://postgres:local-development-only@127.0.0.1:54329/postgres'});
await client.connect();
if(!(await client.query("SELECT 1 FROM pg_roles WHERE rolname='ads_app'")).rowCount) await client.query("CREATE ROLE ads_app LOGIN PASSWORD 'local-development-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS");
if(!(await client.query("SELECT 1 FROM pg_database WHERE datname='goog_ad'")).rowCount) await client.query('CREATE DATABASE goog_ad');
await client.end();console.log('Local PostgreSQL ready on 127.0.0.1:54329');
let stopping=false;
async function stop(){if(stopping)return;stopping=true;await database.stop();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
setInterval(()=>{},60000);
