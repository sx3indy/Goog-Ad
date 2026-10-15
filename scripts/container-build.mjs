import {lookup} from 'node:dns/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
const target=process.argv[2]??'worker';
if(!['web','worker'].includes(target))throw new Error('Usage: npm run container:build -- web|worker');
const args=['build'];
try{
 const hosts=new Set();
 for(const name of ['HTTPS_PROXY','HTTP_PROXY'])if(process.env[name])hosts.add(new URL(process.env[name]).hostname);
 if(hosts.size)args.push('--network=host');
 for(const host of hosts){const {address}=await lookup(host,{family:4});args.push('--add-host',`${host}:${address}`);}
 for(const [name,id] of [['HTTPS_PROXY','cloud_https_proxy'],['HTTP_PROXY','cloud_http_proxy']])if(process.env[name])args.push('--secret',`id=${id},env=${name}`);
 if(process.env.NODE_EXTRA_CA_CERTS)args.push('--secret',`id=cloud_ca,src=${process.env.NODE_EXTRA_CA_CERTS}`);
}catch{console.error('Configured build proxy could not be parsed or resolved');process.exit(1);}
args.push('-f',target==='worker'?'Dockerfile.worker':'Dockerfile','-t',`goog-ad-${target}:local`,'.');
const child=spawn('docker',args,{env:{...process.env,DOCKER_CONFIG:process.env.DOCKER_CONFIG??resolve('.local/docker-config')},stdio:'inherit'});
child.on('exit',code=>process.exit(code??1));child.on('error',()=>{console.error('Docker build could not start');process.exit(1);});
process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));
