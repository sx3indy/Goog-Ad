import './env';
import { DEMO_TENANT, DEMO_USER, Actor } from '../src/core/contracts';
import { runOne } from '../src/server/service';
import { pool } from '../src/server/db';
if(process.env.APP_MODE!=='demo')throw new Error('Live worker disabled pending release gates');
const actor:Actor={tenantId:DEMO_TENANT,userId:DEMO_USER,role:'owner'};
let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
console.log('Deterministic demo worker started');
while(!stopping){try{const result=await runOne(actor);if(result)console.log(JSON.stringify(result));}catch(e){console.error(e instanceof Error?e.message:'Worker failure');}await new Promise(r=>setTimeout(r,1000));}
await pool().end();
