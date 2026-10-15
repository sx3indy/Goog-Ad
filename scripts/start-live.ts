import './env';
import { spawn } from 'node:child_process';
if(process.env.APP_MODE!=='live')throw new Error('Production web requires explicit APP_MODE=live');
for(const name of ['DATABASE_URL','APP_ORIGIN','CLERK_SECRET_KEY','NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'])if(!process.env[name])throw new Error(`Required production binding missing: ${name}`);
if(new URL(process.env.APP_ORIGIN!).protocol!=='https:')throw new Error('Production web origin must use HTTPS');
const port=process.env.PORT??'3000';if(!/^\d{1,5}$/.test(port)||Number(port)>65535)throw new Error('Invalid production port');
const child=spawn(process.execPath,['--use-env-proxy','node_modules/next/dist/bin/next','start','--hostname','0.0.0.0','--port',port],{stdio:'inherit'});
process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));child.on('exit',code=>process.exit(code??1));child.on('error',()=>process.exit(1));
