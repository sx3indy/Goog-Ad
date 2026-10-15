import { z } from 'zod';
import { getActor, checkOrigin } from '@/server/auth';
import { AppError, audit, requireRole, tenantTransaction } from '@/server/db';
import { dashboard, decide, killSwitch, runOne, storeProposal } from '@/server/service';
import { refreshDemo } from '@/server/diagnostics';
import { RequestSchema } from '@/core/control-api';
import { reconcileOutcome } from '@/server/outcomes';
import { boundedJson, limitWrites } from '@/server/http';
import { enqueueSync } from '@/server/jobs';
import { updatePolicy } from '@/server/policy-service';
export const dynamic='force-dynamic';
function failure(e:unknown){
 if(e instanceof AppError)return Response.json({error:e.message},{status:e.status});
 if(e instanceof z.ZodError)return Response.json({error:'Invalid request',issues:e.issues.map(i=>({path:i.path,message:i.message}))},{status:400});
 console.error('Console request failed',e instanceof Error?e.message:'unknown');return Response.json({error:'Service unavailable. Check database and server logs.'},{status:503});
}
export async function GET(){try{return Response.json(await dashboard(await getActor()),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
export async function POST(request:Request){
 try{
  checkOrigin(request);const actor=await getActor();await limitWrites(actor);
  const input=RequestSchema.parse(await boundedJson(request));
  if(input.action==='approve'||input.action==='reject')return Response.json(await decide(actor,input.id,input.action));
  if(input.action==='kill')return Response.json(await killSwitch(actor,input.customerId,input.killed));
  if(input.action==='refresh')return Response.json(await refreshDemo(actor,input.customerId));
  if(input.action==='propose'){requireRole(actor,['owner','analyst']);return Response.json(await tenantTransaction(actor,c=>storeProposal(c,actor,input.proposal)),{status:201});}
  if(input.action==='outcome')return Response.json(await reconcileOutcome(actor,input.outcome));
  if(input.action==='sync')return Response.json(await enqueueSync(actor,input.customerId,input.provider),{status:202});
  if(input.action==='policy')return Response.json(await updatePolicy(actor,input.customerId,input.policy));
  requireRole(actor,['owner']);if(process.env.APP_MODE!=='demo')throw new AppError(503,'Live executor is disabled');
  const result=await runOne(actor);await tenantTransaction(actor,c=>audit(c,actor,'worker.manual_tick','demo',{processed:!!result}));return Response.json({result});
 }catch(e){return failure(e);}
}
