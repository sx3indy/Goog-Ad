import { trace,SpanStatusCode } from '@opentelemetry/api';
export function logEvent(event:string,fields:Record<string,string|number|boolean|null>={}){console.log(JSON.stringify({timestamp:new Date().toISOString(),event,...fields}));}
export async function traced<T>(name:string,fields:Record<string,string|number|boolean>,work:()=>Promise<T>):Promise<T>{
 return trace.getTracer('ados','0.2.0').startActiveSpan(name,async span=>{
  span.setAttributes(fields);const start=Date.now();
  try{const result=await work();span.setStatus({code:SpanStatusCode.OK});logEvent(`${name}.completed`,{durationMs:Date.now()-start});return result;}
  catch(error){span.setStatus({code:SpanStatusCode.ERROR,message:'Operation failed; details redacted'});logEvent(`${name}.failed`,{durationMs:Date.now()-start});throw error;}
  finally{span.end();}
 });
}
