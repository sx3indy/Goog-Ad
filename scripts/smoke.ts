import './env';
import assert from 'node:assert/strict';
const origin=process.env.APP_ORIGIN??'http://127.0.0.1:3000';
let ready=false;
for(let i=0;i<60;i++){try{const r=await fetch(`${origin}/api/health`,{signal:AbortSignal.timeout(3000)});if(r.ok){const h=await r.json();assert.equal(h.status,'ok');assert.equal(h.liveMutations,false);ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
assert.equal(ready,true,'Health readiness timed out');
const response=await fetch(`${origin}/api/console`,{signal:AbortSignal.timeout(15000)});assert.equal(response.ok,true,'Console functional request failed');
const data=await response.json();assert.ok(data.account.customer_id);assert.ok(Array.isArray(data.campaigns)&&data.campaigns.length>0);assert.ok(Array.isArray(data.proposals));assert.ok(data.policy.version);assert.ok(Array.isArray(data.events)&&data.events.length>0);
console.log(JSON.stringify({status:'passed',mode:data.mode,campaigns:data.campaigns.length,proposals:data.proposals.length,auditEvents:data.events.length,liveMutations:false}));
