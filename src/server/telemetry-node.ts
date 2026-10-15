export async function startTelemetry(serviceName:string){
 if(!process.env.OTEL_EXPORTER_OTLP_ENDPOINT)return;
 const { NodeSDK }=await import('@opentelemetry/sdk-node');
 const { OTLPTraceExporter }=await import('@opentelemetry/exporter-trace-otlp-http');
 const url=new URL(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','otel-collector'].includes(url.hostname)))throw new Error('Telemetry exporter requires HTTPS or the local collector');
 const sdk=new NodeSDK({serviceName,traceExporter:new OTLPTraceExporter({url:new URL('v1/traces',url.href.endsWith('/')?url.href:url.href+'/').href})});sdk.start();
 process.once('SIGTERM',()=>{void sdk.shutdown();});
}
