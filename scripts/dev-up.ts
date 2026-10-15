import './env';
import { spawn, ChildProcess } from 'node:child_process';
import { Client } from 'pg';
const owned:ChildProcess[]=[];
if(process.env.APP_MODE!=='demo')throw new Error('dev:up is a loopback-only demo workflow');
function start(script:string){const child=spawn('npm',['run',script],{stdio:'inherit',detached:true});owned.push(child);if(['db:start','worker','dev'].includes(script)){child.on('error',e=>{console.error(`${script} failed`,e.message);stop(1);});child.on('exit',code=>{if(!stopped){console.error(`${script} exited unexpectedly (${code})`);stop(1);}});}return child;}
async function reachable(){const c=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:1000});try{await c.connect();return true;}catch{return false;}finally{await c.end();}}
async function run(script:string){await new Promise<void>((resolve,reject)=>{const p=start(script);p.once('error',reject);p.once('exit',code=>code===0?resolve():reject(new Error(`${script} exited ${code}`)));});}
let stopped=false;
function stop(exitCode=0){if(stopped)return;stopped=true;for(const p of owned)if(p.pid&&p.exitCode===null)try{process.kill(-p.pid,'SIGTERM');}catch{}setTimeout(()=>process.exit(exitCode),1000).unref();}
process.on('SIGTERM',()=>stop());process.on('SIGINT',()=>stop());
try{
 if(!await reachable())start('db:start');
 let ready=false;for(let i=0;i<60;i++){if(await reachable()){ready=true;break;}await new Promise(r=>setTimeout(r,500));}
 if(!ready)throw new Error('Database startup timed out');
 await run('db:migrate');await run('db:seed');
 start('worker');start('dev');
 console.log('Demo services launched. Readiness: GET /api/health and GET /api/console.');
 setInterval(()=>{},60000);
}catch(e){console.error(e);stop(1);}
