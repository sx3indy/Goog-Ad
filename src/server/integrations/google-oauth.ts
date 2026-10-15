import { z } from 'zod';
import { jsonRequest,Transport } from './http';
const Token=z.object({access_token:z.string().min(1),token_type:z.string(),expires_in:z.number().positive()});
export class GoogleOAuth {
 private token:{value:string;expires:number}|null=null;
 private pending:Promise<string>|null=null;
 constructor(private credentials:{clientId:string;clientSecret:string;refreshToken:string},private transport:Transport=fetch){}
 invalidate(){this.token=null;}
 async accessToken():Promise<string>{
  if(this.token&&this.token.expires>Date.now()+60000)return this.token.value;
  if(this.pending)return this.pending;
  this.pending=this.refresh();try{return await this.pending;}finally{this.pending=null;}
 }
 private async refresh(){
  const result=await jsonRequest('Google OAuth','https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:this.credentials.clientId,client_secret:this.credentials.clientSecret,refresh_token:this.credentials.refreshToken}).toString()},this.transport);
  const token=Token.parse(result.body);if(token.token_type.toLowerCase()!=='bearer')throw new Error('Unsupported OAuth token type');
  this.token={value:token.access_token,expires:Date.now()+token.expires_in*1000};return token.access_token;
 }
}
