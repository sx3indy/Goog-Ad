import { z } from 'zod';
import { ProposalSchema,PolicySchema } from './contracts';
import { OutcomeSchema } from '../server/outcomes';
import { Provider } from '../server/jobs';
export const RequestSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('approve'),id:z.uuid()}).strict(),z.object({action:z.literal('reject'),id:z.uuid()}).strict(),
 z.object({action:z.literal('kill'),customerId:z.string().regex(/^\d{10}$/),killed:z.boolean()}).strict(),
 z.object({action:z.literal('refresh'),customerId:z.string().regex(/^\d{10}$/)}).strict(),
 z.object({action:z.literal('run')}).strict(),z.object({action:z.literal('propose'),proposal:ProposalSchema}).strict(),
 z.object({action:z.literal('outcome'),outcome:OutcomeSchema}).strict(),
 z.object({action:z.literal('sync'),customerId:z.string().regex(/^\d{10}$/),provider:Provider}).strict(),
 z.object({action:z.literal('policy'),customerId:z.string().regex(/^\d{10}$/),policy:PolicySchema.omit({version:true,killed:true})}).strict(),
]);
