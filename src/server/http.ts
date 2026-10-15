import { Actor } from '../core/contracts';
import { AppError, tenantTransaction } from './db';
export async function limitWrites(actor:Actor){
 const allowed=await tenantTransaction(actor,async c=>{
  await c.query("DELETE FROM control_api_rate_buckets WHERE window_start<now()-interval '1 hour'");
  return (await c.query("INSERT INTO control_api_rate_buckets(tenant_id,id,user_id,window_start,count) VALUES($1,$2,$3,date_trunc('minute',now()),1) ON CONFLICT(tenant_id,user_id,window_start) DO UPDATE SET count=control_api_rate_buckets.count+1 WHERE control_api_rate_buckets.count<60 RETURNING count",[actor.tenantId,crypto.randomUUID(),actor.userId])).rowCount;
 });if(!allowed)throw new AppError(429,'Write rate limit exceeded; retry after the current minute');
}
export async function boundedJson(request:Request){
 const reader=request.body?.getReader();if(!reader)throw new AppError(400,'JSON body required');
 const parts:Uint8Array[]=[];let bytes=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>32768){await reader.cancel();throw new AppError(413,'Request too large');}parts.push(value);}}finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new AppError(400,'Invalid JSON');}
}
