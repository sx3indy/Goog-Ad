export async function register(){
 if(process.env.NEXT_RUNTIME==='nodejs'){const {startTelemetry}=await import('./server/telemetry-node');await startTelemetry('ados-web');}
}
