import { z } from 'zod';

export const Role = z.enum(['viewer', 'analyst', 'approver', 'owner']);
export type Role = z.infer<typeof Role>;
export type Actor = { tenantId: string; userId: string; role: Role };
const iso = z.iso.datetime();
const micros = z.string().regex(/^(0|[1-9][0-9]{0,17})$/);
export const PolicySchema = z.object({
  version: z.string().min(1), autonomy: z.enum(['L0','L1','L2','L3','L4']),
  dailyPlannedMicros: micros, maxReductionPercent: z.number().int().min(0).max(10),
  freshnessMinutes: z.number().int().min(1).max(180), minSampleSize: z.number().int().min(1),
  allowedActions: z.array(z.enum(['PAUSE_CAMPAIGN','UPDATE_BUDGET'])),
  protectedTerms: z.array(z.string().min(1)), killed: z.boolean(),
}).strict();
export type Policy = z.infer<typeof PolicySchema>;
export const ProposalSchema = z.object({
  id: z.uuid(), tenantId: z.uuid(), customerId: z.string().regex(/^\d{10}$/),
  resourceName: z.string().regex(/^customers\/\d{10}\/campaigns\/\d+$/),
  action: z.enum(['PAUSE_CAMPAIGN','UPDATE_BUDGET','PROPOSE_NEGATIVE','UPDATE_BID_TARGET','CREATE_AD_DRAFT']),
  observedAt: iso, evidenceWindow: z.object({start:iso,end:iso}).strict(),
  evidence: z.array(z.object({metric:z.string(),value:z.number().finite(),sampleSize:z.number().int().nonnegative(),sourceSnapshotId:z.uuid(),attributionMature:z.boolean()}).strict()).min(1),
  expectedImpact: z.object({metric:z.string(),estimate:z.number().finite(),lowerBound:z.number().finite(),upperBound:z.number().finite()}).strict(),
  mutation: z.object({before:z.record(z.string(),z.unknown()),after:z.record(z.string(),z.unknown())}).strict(),
  policyVersion:z.string(), modelVersion:z.string().nullable(), expiresAt:iso,
  idempotencyKey:z.string().min(8).max(200), title:z.string().min(1).max(160),
  explanation:z.string().min(1).max(2000), origin:z.enum(['diagnostic','operator','model']),
}).strict();
export type Proposal = z.infer<typeof ProposalSchema>;
export type CampaignState = { status: 'ENABLED'|'PAUSED'; budgetMicros: string; budgetResourceName?:string; sharedBudget?:boolean };
export type Snapshot = { id:string; tenantId:string; customerId:string; resourceName:string; observedAt:string; sourceAt:string; complete:boolean; attributionMature:boolean; metrics:Record<string,number>; state:CampaignState };
export type PolicyResult = { eligible:boolean; reasons:string[]; requiresApproval:boolean; mask:('status'|'budgetMicros')[] };
export const DEMO_TENANT = '10000000-0000-4000-8000-000000000001';
export const DEMO_USER = '20000000-0000-4000-8000-000000000001';
export const defaultPolicy:Policy = {version:'2026-10-14.1',autonomy:'L2',dailyPlannedMicros:'250000000',maxReductionPercent:10,freshnessMinutes:180,minSampleSize:30,allowedActions:['PAUSE_CAMPAIGN','UPDATE_BUDGET'],protectedTerms:['senior living','assisted living'],killed:false};
