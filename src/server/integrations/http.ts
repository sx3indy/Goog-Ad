export class IntegrationError extends Error {
  constructor(public provider:string,public status:number,public retryable:boolean,public ambiguous:boolean,public requestId:string|null=null,public retryAfterSeconds:number|null=null){super(`${provider} request failed (${status||'transport'})`);}
}
export type Transport=typeof fetch;
export async function jsonRequest(provider:string,url:string,init:RequestInit,transport:Transport=fetch,mutation=false):Promise<{body:unknown;requestId:string|null}>{
 let response:Response;
 try{response=await transport(url,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new IntegrationError(provider,0,true,mutation);}
 const id=response.headers.get('request-id')??response.headers.get('x-request-id');
 if(!response.ok){const retry=response.status===429||response.status>=500;const seconds=Number(response.headers.get('retry-after'));await response.body?.cancel().catch(()=>{});throw new IntegrationError(provider,response.status,retry,mutation&&response.status>=500,id,Number.isFinite(seconds)&&seconds>0?Math.min(seconds,3600):null);}
 const reader=response.body?.getReader();if(!reader)throw new IntegrationError(provider,502,false,mutation,id);
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16*1024*1024){await reader.cancel();throw new IntegrationError(provider,502,false,mutation,id);}chunks.push(value);}}catch(e){if(e instanceof IntegrationError)throw e;throw new IntegrationError(provider,0,true,mutation,id);}finally{reader.releaseLock();}
 try{return {body:JSON.parse(Buffer.concat(chunks).toString('utf8')),requestId:id};}catch{throw new IntegrationError(provider,502,false,mutation,id);}
}
