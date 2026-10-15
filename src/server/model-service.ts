import { Actor } from '../core/contracts';
import { ModelContext,ProposalModel,modelProposals } from '../core/intelligence';
import { accountPolicy,evidenceSnapshots,storeProposal } from './service';
import { evaluatePolicy } from '../core/policy';
import { tenantTransaction } from './db';
export async function generateModelProposals(actor:Actor,customerId:string,model:ProposalModel){
 const context=await tenantTransaction(actor,async c=>{
  const policy=await accountPolicy(c,customerId);
  const rows=(await c.query('SELECT DISTINCT ON(resource_name) * FROM campaign_snapshots WHERE customer_id=$1 ORDER BY resource_name,observed_at DESC LIMIT 10',[customerId])).rows;
  const metrics:Record<string,number>={};
  for(const r of rows)for(const name of ['impressions','clicks','qualifiedCpa','sampleSize','qualifiedLeads'])if(typeof r.metrics[name]==='number')metrics[`${r.id}:${name}`]=r.metrics[name];
  return {snapshotIds:rows.map(r=>r.id),redactedMetrics:metrics,targets:rows.map(r=>({tenantId:actor.tenantId,customerId,resourceName:r.resource_name,snapshotId:r.id,policyVersion:policy.version,state:r.state}))} satisfies ModelContext;
 });
 const output=await modelProposals(model,context);
 if(output.modelVersion!==model.name)throw new Error('Provider model provenance mismatch');
 return tenantTransaction(actor,async c=>{
  const policy=await accountPolicy(c,customerId);let created=0;
  for(const p of output.proposals){
   if(p.customerId!==customerId||p.tenantId!==actor.tenantId)throw new Error('Model target scope mismatch');
   const target=context.targets.find(t=>t.resourceName===p.resourceName);if(!target)throw new Error('Model target not supplied');
   const guard=evaluatePolicy(p,policy,await evidenceSnapshots(c,p),target.state as any);
   if(!guard.eligible)continue;await storeProposal(c,actor,p);created++;
  }
  await c.query('INSERT INTO model_runs(tenant_id,id,customer_id,provider,model_version,template_version,source_snapshot_ids,proposal_count,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[actor.tenantId,crypto.randomUUID(),customerId,model.name,output.modelVersion,output.templateVersion,context.snapshotIds,created,'completed']);return {created,rejected:output.proposals.length-created,missingData:output.missingData.length};
 });
}
