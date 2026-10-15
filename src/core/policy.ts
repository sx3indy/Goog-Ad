import { CampaignState, Policy, PolicyResult, Proposal, ProposalSchema, Snapshot } from './contracts';

export function evaluatePolicy(input:Proposal, policy:Policy, snapshots:Snapshot[], state:CampaignState, now=new Date()):PolicyResult {
  const reasons:string[]=[];
  const parsed=ProposalSchema.safeParse(input);
  if(!parsed.success) return {eligible:false,reasons:['Proposal schema invalid'],requiresApproval:true,mask:[]};
  const p=parsed.data;
  if(policy.killed) reasons.push('Account kill switch is active');
  if(['L0','L1'].includes(policy.autonomy)) reasons.push('Account is observe/recommend only');
  if(p.policyVersion!==policy.version) reasons.push('Policy version changed');
  if(Date.parse(p.expiresAt)<=now.getTime()) reasons.push('Proposal expired');
  if(Date.parse(p.observedAt)>now.getTime() || now.getTime()-Date.parse(p.observedAt)>policy.freshnessMinutes*60000) reasons.push('Proposal observation is stale or in the future');
  if(Date.parse(p.evidenceWindow.start)>Date.parse(p.evidenceWindow.end) || Date.parse(p.evidenceWindow.end)>now.getTime()) reasons.push('Invalid evidence window');
  if(p.expectedImpact.lowerBound>p.expectedImpact.estimate || p.expectedImpact.estimate>p.expectedImpact.upperBound) reasons.push('Impact bounds invalid');
  if(!p.resourceName.startsWith(`customers/${p.customerId}/`)) reasons.push('Resource does not belong to customer');
  if(!policy.allowedActions.includes(p.action as 'PAUSE_CAMPAIGN'|'UPDATE_BUDGET')) reasons.push('Action is not enabled for execution');
  for(const e of p.evidence){
    const s=snapshots.find(s=>s.id===e.sourceSnapshotId);
    if(!s || s.tenantId!==p.tenantId || s.customerId!==p.customerId || s.resourceName!==p.resourceName){reasons.push('Evidence source is missing or outside the account');continue;}
    if(!s.complete) reasons.push('Evidence source incomplete');
    if(Date.parse(s.sourceAt)>now.getTime() || now.getTime()-Date.parse(s.sourceAt)>policy.freshnessMinutes*60000) reasons.push('Source data is stale or in the future');
    if(Date.parse(s.observedAt)<Date.parse(p.evidenceWindow.start) || Date.parse(s.observedAt)>Date.parse(p.evidenceWindow.end)) reasons.push('Source outside evidence window');
    if(s.metrics[e.metric]!==e.value || s.metrics.sampleSize!==e.sampleSize) reasons.push('Evidence does not match immutable source');
    if(e.sampleSize<policy.minSampleSize) reasons.push('Insufficient sample size');
    if(!e.attributionMature || !s.attributionMature) reasons.push('Attribution is not mature');
  }
  let mask:('status'|'budgetMicros')[]=[];
  if(p.action==='PAUSE_CAMPAIGN'){
    const shape=zState(p.mutation.before,p.mutation.after,'status');
    if(!shape || p.mutation.before.status!==state.status || p.mutation.after.status!=='PAUSED' || state.status!=='ENABLED') reasons.push('Pause state or mutation mask invalid');
    mask=['status'];
  } else if(p.action==='UPDATE_BUDGET'){
    const before=p.mutation.before.budgetMicros, after=p.mutation.after.budgetMicros;
    const shape=state.budgetResourceName?Object.keys(p.mutation.before).length===2&&Object.keys(p.mutation.after).length===1&&p.mutation.before.budgetResourceName===state.budgetResourceName&&'budgetMicros' in p.mutation.after:zState(p.mutation.before,p.mutation.after,'budgetMicros');
    if(state.sharedBudget) reasons.push('Shared budget changes require a separate approval scope');
    if(!shape || typeof before!=='string' || typeof after!=='string' || !/^\d{1,18}$/.test(before) || !/^\d{1,18}$/.test(after) || before!==state.budgetMicros) reasons.push('Budget state or mutation mask invalid');
    else {
      const b=BigInt(before), a=BigInt(after);
      if(b<=0n || a<=0n || a===b) reasons.push('Budget must be positive and change');
      if(a<b && (b-a)*100n>b*BigInt(policy.maxReductionPercent)) reasons.push('Budget reduction exceeds account limit');
      // Increases are deliberately not enabled until live release gates pass.
      if(a>b) reasons.push('Budget increases are disabled in this release');
    }
    mask=['budgetMicros'];
  }
  // First release always requires human approval; higher autonomy remains shadow-only.
  return {eligible:reasons.length===0,reasons:[...new Set(reasons)],requiresApproval:true,mask};
}
function zState(before:Record<string,unknown>,after:Record<string,unknown>,key:string){return Object.keys(before).length===1 && Object.keys(after).length===1 && key in before && key in after;}

export function pacing(spendMicros:string|null, plannedMicros:string, elapsedFraction:number, sourceFresh:boolean){
  if(spendMicros===null || !sourceFresh) return {status:'unknown' as const,forecastMicros:null,lowerMicros:null,upperMicros:null};
  const spend=BigInt(spendMicros),planned=BigInt(plannedMicros);
  const denominator=BigInt(Math.max(1,Math.round(Math.min(1,Math.max(.01,elapsedFraction))*10000)));
  const forecast=spend*10000n/denominator, upper=forecast*125n/100n, lower=forecast*80n/100n;
  const status=upper>planned*120n/100n?'elevated':upper>planned*80n/100n?'warning':'healthy';
  return {status,forecastMicros:forecast.toString(),lowerMicros:lower.toString(),upperMicros:upper.toString()};
}
