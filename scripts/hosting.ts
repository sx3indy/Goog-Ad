import './env';
import {mkdirSync,existsSync,readFileSync,writeFileSync,renameSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {HostingProvisioner} from '../src/server/integrations/hosting';
import {z} from 'zod';
const mode=process.argv[2]??'plan';if(!['plan','create'].includes(mode))throw new Error('Usage: npm run hosting -- plan|create');
const required=['VERCEL_TOKEN','RAILWAY_API_TOKEN','RAILWAY_WORKSPACE_ID'];const missing=required.filter(name=>!process.env[name]);
const plan={vercel:{name:'goog-ad',framework:'nextjs',node:'24.x'},railway:{name:'goog-ad',service:'goog-ad-worker',configFile:'infra/railway.worker.toml'},source:'sx3indy/Goog-Ad',deployment:'Not triggered; projects are initialized without a Git source',missing};
if(mode==='plan'){console.log(JSON.stringify({status:'plan',...plan},null,2));}
else if(missing.length){console.log(JSON.stringify({status:'blocked',missing},null,2));process.exitCode=1;}
else{
 mkdirSync('.local',{recursive:true});const lock='.local/hosting-provision.lock',file='.local/hosting-projects.json';const fd=openSync(lock,'wx');
 try{
  const schema=z.object({vercelId:z.string().optional(),railwayId:z.string().optional(),environmentId:z.string().optional(),workerId:z.string().optional(),workspaceId:z.string(),teamId:z.string().optional()}).strict();
  let state=schema.parse(existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{workspaceId:process.env.RAILWAY_WORKSPACE_ID,teamId:process.env.VERCEL_TEAM_ID});
  if(state.workspaceId!==process.env.RAILWAY_WORKSPACE_ID||state.teamId!==process.env.VERCEL_TEAM_ID)throw new Error('Hosting scope changed; preserve and review the existing resource manifest');
  function save(){writeFileSync(file+'.tmp',JSON.stringify(state,null,2)+'\n',{mode:0o600});renameSync(file+'.tmp',file);}
  const hosting=new HostingProvisioner({vercelToken:process.env.VERCEL_TOKEN!,railwayToken:process.env.RAILWAY_API_TOKEN!,workspaceId:state.workspaceId,teamId:state.teamId});
  const vercel=await hosting.vercelProject(),projects=await hosting.railwayProjects(),railway=projects.find(p=>p.name==='goog-ad');
  if(vercel&&vercel.id!==state.vercelId||railway&&railway.id!==state.railwayId)throw new Error('A project with this name already exists outside the saved manifest; do not overwrite or recreate it');
  if(state.vercelId&&!vercel||state.railwayId&&!railway)throw new Error('A saved hosting resource is no longer visible; do not silently recreate it');
  const existingWorkers=railway?.services.edges.filter(e=>e.node.name==='goog-ad-worker')??[];
  if(existingWorkers.length>1||existingWorkers.length===1&&existingWorkers[0].node.id!==state.workerId)throw new Error('Existing worker is outside the saved manifest; inspect before creating another service');
  if(state.workerId&&existingWorkers.length!==1)throw new Error('Saved worker is no longer visible; do not silently recreate it');
  if(!vercel){state.vercelId=(await hosting.createVercel()).id;save();}
  if(!railway){const created=await hosting.createRailway();state.railwayId=created.id;const environment=created.environments.edges.find(e=>e.node.name==='production');if(!environment){save();throw new Error('Production environment missing; inspect the created Railway project');}state.environmentId=environment.node.id;save();}
  if(!state.environmentId)throw new Error('Saved Railway environment binding is missing');
  if(!state.workerId){state.workerId=(await hosting.createWorker(state.railwayId!,state.environmentId)).id;save();}
  await hosting.configureWorker(state.workerId,state.environmentId);
  console.log(JSON.stringify({status:'initialized',...state,deployed:false}));
 }catch{console.error('Hosting initialization stopped. Preserve .local/hosting-projects.json and inspect account permissions or existing resources; mutations are never automatically retried.');process.exitCode=1;}
 finally{closeSync(fd);unlinkSync(lock);}
}
