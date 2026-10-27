import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {createServer,Server} from 'node:http';
import {resolve,join} from 'node:path';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {runSponsorScenario} from '../lib/sponsors/scenario-service';
import {syntheticFixtureDependencies} from '../lib/sponsors/scenario-fixture';
import {SponsorWorkerQueue} from '../lib/sponsors/worker-queue';
import {createWorkerServer,listenPrivateWorker,closePrivateWorker} from '../lib/sponsors/worker-server';
import {PrivateWorkerClient} from '../lib/sponsors/worker-client';
import {createSponsorHandlers} from '../lib/sponsors/web-controller';
import {SponsorError} from '../lib/sponsors/zetaris';
import {AppError} from '../lib/security';
import type {JobView} from '../lib/sponsors/worker-protocol';
const args=process.argv.slice(2),option=(name:string)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const owner=(id:string)=>'synthetic-'+createHash('sha256').update(id).digest('hex');
async function main(){
 const live=args.includes('--live'),runId=randomUUID(),root=resolve('.runtime/worker-flow',runId),memoryRoot=join(root,'memory');
 await mkdir(root,{recursive:true});
 const report:Record<string,any>={schema:'atlas-worker-flow-v1',runId,startedAt:new Date().toISOString(),mockUsed:!live,webAuthentication:'synthetic-fixture-not-real-membership',publicSiteVerified:false,productionChanged:false,deployed:false};
 let queue:SponsorWorkerQueue|undefined,worker:Server|undefined,web:Server|undefined;
 try{
  if(process.env.CODEX_SANDBOX_NETWORK_DISABLED==='1')throw new SponsorError('DEV_NETWORK_RESTRICTED');
  const zetarisEnv=option('--zetaris-env'),meterlessTokenFile=option('--meterless-token-file');
  if(live&&(!zetarisEnv||!meterlessTokenFile))throw new SponsorError('EXPLICIT_CREDENTIAL_FILES_REQUIRED');
  const config={zetarisEnv:zetarisEnv||'fixture',meterlessTokenFile:meterlessTokenFile||'fixture',memoryRoot};let executions=0;
  queue=await SponsorWorkerQueue.create({root:join(root,'queue'),execute:job=>{executions++;return runSponsorScenario({config,ownerId:job.ownerId,runId:job.id,signal:job.signal,...(live?{}:{dependencies:syntheticFixtureDependencies()})});}});
  const token=randomBytes(32).toString('base64url'),harnessToken=randomBytes(32).toString('base64url');
  worker=createWorkerServer(queue,token);const workerUrl=await listenPrivateWorker(worker);
  const client=new PrivateWorkerClient({baseUrl:workerUrl,token,allowLoopbackHttp:true});let webUrl='';
  web=createServer({requestTimeout:10000,headersTimeout:5000,maxHeaderSize:8192},(req,res)=>{
   if(req.headers['x-harness-access']!==harnessToken){res.writeHead(401);res.end('{}');req.resume();return;}
   let size=0,tooLarge=false;const chunks:Buffer[]=[];
   req.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>512)tooLarge=true;else chunks.push(chunk);});
   req.on('error',()=>{res.statusCode=400;res.end('{}');});
   req.on('end',()=>{void(async()=>{try{
    if(tooLarge){res.statusCode=413;res.end('{}');return;}
    const headers=new Headers();for(const [name,value]of Object.entries(req.headers))if(typeof value==='string')headers.set(name,value);
    const method=req.method||'GET',request=new Request(webUrl+(req.url||'/'),{method,headers,...(method==='GET'||method==='HEAD'?{}:{body:Buffer.concat(chunks)})});
    const user=req.headers['x-synthetic-user'];
    const handlers=createSponsorHandlers({enabled:()=>true,authorize:async()=>{if(user!=='operator-a'&&user!=='operator-b')throw new AppError('synthetic fixture denied',403);return {id:user};},origin:r=>{if(r.headers.get('origin')!==webUrl)throw new AppError('fixture origin denied',403);},rateLimit:async()=>{},client:()=>client});
    const action=method==='POST'?handlers.POST:method==='DELETE'?handlers.DELETE:handlers.GET;const result=await action(request);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());
   }catch{res.statusCode=503;res.end('{"error":"DEV_WEB_FAILED"}');}})();});
  });webUrl=await listenPrivateWorker(web);
  const call=async(method:string,user:string,body?:unknown,id?:string,foreign=false)=>fetch(webUrl+'/api/sponsor-demo'+(id?'?id='+id:''),{method,signal:AbortSignal.timeout(15000),headers:{'x-harness-access':harnessToken,'x-synthetic-user':user,Origin:foreign?'https://foreign.invalid':webUrl,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const wait=async(user:string,id:string)=>{const deadline=Date.now()+280000;while(Date.now()<deadline){const response=await call('GET',user,undefined,id);if(!response.ok)throw new SponsorError('DEV_JOB_STATUS_FAILED');const job=await response.json() as JobView;if(!['queued','running'].includes(job.status))return job;await new Promise(r=>setTimeout(r,live?500:10));}throw new SponsorError('DEV_JOB_WAIT_EXPIRED');};  report.httpChecks={workerUnauthorized:(await fetch(workerUrl+'/health')).status,webNonOperator:(await call('POST','viewer',{scenario:'paper-packaging'})).status,foreignOrigin:(await call('POST','operator-a',{scenario:'paper-packaging'},undefined,true)).status,injectedOwner:(await call('POST','operator-a',{scenario:'paper-packaging',ownerId:owner('operator-b')})).status};
  if(JSON.stringify(report.httpChecks)!==JSON.stringify({workerUnauthorized:401,webNonOperator:403,foreignOrigin:403,injectedOwner:400}))throw new SponsorError('DEV_SECURITY_CHECK_FAILED');
  const run=async(user:string)=>{const requestId=randomUUID(),response=await call('POST',user,{scenario:'paper-packaging',requestId});if(response.status!==202)throw new SponsorError('DEV_JOB_ADMISSION_FAILED');const admitted=await response.json() as JobView,done=await wait(user,admitted.id);report.jobs=report.jobs||[];report.jobs.push(done);if(done.status!=='succeeded')throw new SponsorError(done.error||'DEV_SCENARIO_FAILED');const duplicate=await client.start(owner(user),requestId);if(duplicate.id!==done.id)throw new SponsorError('DEV_IDEMPOTENCY_FAILED');return done;};
  const cold=await run('operator-a'),warm=await run('operator-a');
  report.crossOwnerStatus=(await call('GET','operator-b',undefined,cold.id)).status;if(report.crossOwnerStatus!==404)throw new SponsorError('DEV_OWNER_ISOLATION_FAILED');
  const isolated=await run('operator-b');
  if(cold.result?.memory.priorRecallCount!==0||warm.result?.memory.priorRecallCount!==2||isolated.result?.memory.priorRecallCount!==0||executions!==3)throw new SponsorError('DEV_MEMORY_OR_IDEMPOTENCY_FAILED');
  const child=spawnSync(process.execPath,[resolve('node_modules/tsx/dist/cli.mjs'),resolve('scripts/read-sponsor-memory.ts'),memoryRoot,owner('operator-a')],{cwd:process.cwd(),encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:65536});
  let memory;try{memory=JSON.parse(child.stdout);}catch{throw new SponsorError('DEV_MEMORY_PROCESS_FAILED');}if(child.status!==0||memory.recallCount!==2||memory.fixedSyntheticIdsOnly!==true)throw new SponsorError('DEV_MEMORY_PROCESS_FAILED');
  report.memoryProcess=memory;report.executionCount=executions;report.transport='real-loopback-http-web-controller-and-worker';report.webRateLimit='injected-fixture-not-real-database';report.sharedService='sponsor-scenario-v1';report.overall=live?'live-worker-synthetic-confirmed':'mock-worker-http-confirmed';
 }catch(e){report.overall='blocked-or-failed';report.error=e instanceof SponsorError?e.code:'DEV_WORKER_CHECK_FAILED';process.exitCode=1;}
 finally{
  try{if(web?.listening)await closePrivateWorker(web);if(queue)await queue.close();if(worker?.listening)await closePrivateWorker(worker);}catch{report.cleanup='REQUIRES_REVIEW';process.exitCode=1;}
  report.finishedAt=new Date().toISOString();const path=join(root,'report.json'),text=JSON.stringify(report,null,2);await writeFile(path,text,{encoding:'utf8',flag:'wx',mode:0o600});if(await readFile(path,'utf8')!==text)throw new SponsorError('REPORT_READBACK_FAILED');console.log(JSON.stringify({...report,reportFile:path},null,2));
 }
}
main().catch(()=>{console.error('DEV_WORKER_CHECK_FAILED');process.exitCode=1;});