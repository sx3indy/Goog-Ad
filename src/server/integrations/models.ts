import { z } from 'zod';
import { AgentOutput,ProposalModel } from '../../core/intelligence';
import { jsonRequest,Transport } from './http';
export class ClaudeModel implements ProposalModel {
 readonly name:string;
 constructor(private config:{model:string;apiKey:string},private transport:Transport=fetch){if(!config.apiKey)throw new Error('Claude API key missing');z.string().regex(/^[a-zA-Z0-9._:-]{1,100}$/).parse(config.model);this.name=`claude:${config.model}`;}
 async generate(context:Parameters<ProposalModel['generate']>[0],instructions:string){
  const response=await jsonRequest('Claude','https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':this.config.apiKey,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:this.config.model,max_tokens:4096,system:instructions,messages:[{role:'user',content:JSON.stringify({context,requiredModelVersion:this.name,schema:z.toJSONSchema(AgentOutput)})}]})},this.transport);
  const parsed=z.object({stop_reason:z.string().nullable(),content:z.array(z.object({type:z.string(),text:z.string().optional()}))}).parse(response.body);if(parsed.stop_reason!=='end_turn')throw new Error('Claude output incomplete');
  return JSON.parse(parsed.content.filter(p=>p.type==='text').map(p=>p.text??'').join(''));
 }
}
export class GeminiModel implements ProposalModel {
 readonly name:string;
 constructor(private config:{model:string;apiKey:string},private transport:Transport=fetch){if(!config.apiKey)throw new Error('Gemini API key missing');z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/).parse(config.model);this.name=`gemini:${config.model}`;}
 async generate(context:Parameters<ProposalModel['generate']>[0],instructions:string){
  const response=await jsonRequest('Gemini',`https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':this.config.apiKey},body:JSON.stringify({systemInstruction:{parts:[{text:instructions}]},contents:[{role:'user',parts:[{text:JSON.stringify({context,requiredModelVersion:this.name,schema:z.toJSONSchema(AgentOutput)})}]}],generationConfig:{responseMimeType:'application/json',maxOutputTokens:4096}})},this.transport);
  const parsed=z.object({candidates:z.array(z.object({finishReason:z.string(),content:z.object({parts:z.array(z.object({text:z.string()}))})})).min(1).max(1)}).parse(response.body);if(parsed.candidates[0].finishReason!=='STOP')throw new Error('Gemini output incomplete or blocked');return JSON.parse(parsed.candidates[0].content.parts.map(p=>p.text).join(''));
 }
}
