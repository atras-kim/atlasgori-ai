import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {mkdir,appendFile,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {SponsorWorkerQueue} from '../lib/sponsors/worker-queue';
import {createWorkerHandler} from '../lib/sponsors/worker-server';
import {PrivateWorkerClient} from '../lib/sponsors/worker-client';
import {runSponsorScenario} from '../lib/sponsors/scenario-service';
import {syntheticFixtureDependencies} from '../lib/sponsors/scenario-fixture';
import {createSponsorHandlers} from '../lib/sponsors/web-controller';
import {EXPECTED_ROWS,SponsorError} from '../lib/sponsors/zetaris';
import {AppError} from '../lib/security';
const owner=(s:string)=>'synthetic-'+createHash('sha256').update(s).digest('hex');
const a=owner('fixture-a'),b=owner('fixture-b'),model='local-runtime/llama-3.2-3b-instruct';
const root=()=>resolve('.runtime/worker-tests',randomUUID());
const fixture=(id:string)=>({schema:'atlas-local-live-v1',runId:id,dataClass:'fixed-synthetic-only',mockUsed:true,overall:'mock-services-local-memory',zetaris:{ok:true,rows:EXPECTED_ROWS,receipt:{transport:'mock'}},meterless:{ok:true,selected:'SYNTH-PAPER-002',receipt:{transport:'mock',serverRequestId:'fixture-'+id,localOnly:true,model},runtimeEvidence:{serverRequestId:'fixture-'+id,localOnly:true,model,signatureValidWithEmbeddedKey:true}},memory:{implementation:'local-hmem-subset',priorRecallCount:0,recallCount:2,persistedAcrossInstances:true}});
async function until(fn:()=>Promise<boolean>|boolean){const end=Date.now()+2000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,3));}throw Error('test deadline');}
const start=(ownerId=a)=>({ownerId,requestId:randomUUID(),scenario:'paper-packaging'});
test('shared service cold/warm and owner isolation',async()=>{
 const config={zetarisEnv:'fixture',meterlessTokenFile:'fixture',memoryRoot:root()};
 const run=(ownerId:string)=>runSponsorScenario({config,ownerId,dependencies:syntheticFixtureDependencies()});
 const cold=await run(a),warm=await run(a),isolated=await run(b);
 assert.equal(cold.overall,'mock-services-local-memory');assert.equal(cold.memory.priorRecallCount,0);assert.equal(warm.memory.priorRecallCount,2);assert.equal(isolated.memory.priorRecallCount,0);
});
test('shared service failure and cancellation cannot create success or start memory writes',async()=>{
 const config={zetarisEnv:'fixture',meterlessTokenFile:'fixture',memoryRoot:root()},deps=syntheticFixtureDependencies();let calls=0;deps.query=async()=>{throw new SponsorError('ZETARIS_UNAUTHORIZED');};deps.decide=async()=>{calls++;throw Error();};
 const failed=await runSponsorScenario({config,ownerId:a,dependencies:deps});assert.equal(failed.overall,'blocked');assert.equal(calls,0);assert.equal(failed.memory,undefined);
 const controller=new AbortController(),cancelDeps=syntheticFixtureDependencies(),confirm=cancelDeps.confirm;cancelDeps.confirm=async e=>{const value=await confirm(e);controller.abort();return value;};
 await assert.rejects(runSponsorScenario({config,ownerId:a,signal:controller.signal,dependencies:cancelDeps}),/SCENARIO_CANCELLED/);
});
test('worker jobs are idempotent across restart and cross-owner access is hidden',async()=>{
 const dir=root();let calls=0;const exec=async({id}:{id:string})=>{calls++;return fixture(id);};let q=await SponsorWorkerQueue.create({root:dir,execute:exec});const input=start();
 const first=await q.submit(input),again=await q.submit(input);assert.equal(first.id,again.id);await until(async()=> (await q.get(first.id,a)).status==='succeeded');assert.equal(calls,1);
 await assert.rejects(q.get(first.id,b),/JOB_NOT_FOUND/);await assert.rejects(q.cancel(first.id,b),/JOB_NOT_FOUND/);await q.close();q=await SponsorWorkerQueue.create({root:dir,execute:exec});try{const replay=await q.submit(input);assert.equal(replay.id,first.id);assert.equal(replay.status,'succeeded');assert.equal(calls,1);}finally{await q.close();}
});
test('running cancel retains slot and late success cannot replace terminal state',async()=>{
 let release!:()=>void,calls=0;const held=new Promise<void>(r=>release=r);const q=await SponsorWorkerQueue.create({root:root(),execute:async({id})=>{calls++;await held;return fixture(id);}});
 const job=await q.submit(start());await until(()=>q.health().running===1);const queued=await q.submit(start(b));assert.equal((await q.cancel(job.id,a)).status,'cancelled');assert.equal(q.health().running,1);assert.equal((await q.get(queued.id,b)).status,'cancelled');await assert.rejects(q.submit(start()),/WORKER_PAUSED/);
 release();await until(()=>q.health().running===0);assert.equal((await q.get(job.id,a)).status,'cancelled');assert.equal(calls,1);await q.close();
});
test('deadline, queued TTL and queue capacity are bounded',async()=>{
 let release!:()=>void;const held=new Promise<void>(r=>release=r);const q=await SponsorWorkerQueue.create({root:root(),queueLimit:1,queueTtlMs:20,runTimeoutMs:80,execute:async({id})=>{await held;return fixture(id);}});
 const job=await q.submit(start());await until(()=>q.health().running===1);const queued=await q.submit(start(b));await assert.rejects(q.submit(start()),/QUEUE_FULL/);await until(async()=> (await q.get(queued.id,b)).status==='expired');await until(async()=> (await q.get(job.id,a)).status==='expired');assert.equal(q.health().running,1);assert.equal(q.health().paused,true);release();await until(()=>q.health().running===0);assert.equal((await q.get(job.id,a)).status,'expired');await q.close();
});
test('exclusive lock and incomplete journal fail closed without clearing evidence',async()=>{
 const dir=root();const q=await SponsorWorkerQueue.create({root:dir,execute:async({id})=>fixture(id)});await assert.rejects(SponsorWorkerQueue.create({root:dir,execute:async({id})=>fixture(id)}),/WORKER_LOCKED/);await q.close();const file=join(dir,'jobs.jsonl');await appendFile(file,'{"partial":');const before=await readFile(file,'utf8');await assert.rejects(SponsorWorkerQueue.create({root:dir,execute:async({id})=>fixture(id)}),/RECOVERY_REQUIRED/);assert.equal(await readFile(file,'utf8'),before);
});
test('restart interrupts unfinished jobs, preserves key and pauses uncertain runtime',async()=>{
 const dir=root();await mkdir(dir,{recursive:true});const input=start(),id=randomUUID(),now=new Date().toISOString();let previous='genesis',text='';for(const status of ['queued','running']){const body={version:1,previous,job:{...input,id,status,createdAt:now,updatedAt:now,queuedUntil:Date.now()+30000}};previous=createHash('sha256').update(JSON.stringify(body)).digest('hex');text+=JSON.stringify({...body,hash:previous})+'\n';}await writeFile(join(dir,'jobs.jsonl'),text);let calls=0;const q=await SponsorWorkerQueue.create({root:dir,execute:async({id})=>{calls++;return fixture(id);}});try{const view=await q.submit(input);assert.equal(view.status,'interrupted');assert.equal(q.health().paused,true);await assert.rejects(q.submit(start()),/WORKER_PAUSED/);assert.equal(calls,0);}finally{await q.close();}
});
test('worker authentication, strict body and private client prevent credential leakage',async()=>{
 const token=randomBytes(32).toString('base64url'),q=await SponsorWorkerQueue.create({root:root(),execute:async({id})=>fixture(id)}),handler=createWorkerHandler(q,token);const transport=async(url:unknown,init?:RequestInit)=>handler(new Request(String(url),init));try{
  assert.equal((await handler(new Request('http://127.0.0.1/health'))).status,401);assert.equal((await handler(new Request('http://127.0.0.1/health',{headers:{Authorization:'Bearer '+token,Origin:'https://evil.test'}}))).status,403);const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  assert.equal((await handler(new Request('http://127.0.0.1/v1/jobs',{method:'POST',headers,body:JSON.stringify({...start(),sql:'not-allowed'})}))).status,400);assert.equal((await handler(new Request('http://127.0.0.1/v1/jobs',{method:'POST',headers,body:'x'.repeat(1025)}))).status,413);
  const client=new PrivateWorkerClient({baseUrl:'http://127.0.0.1',token,allowLoopbackHttp:true},transport as typeof fetch),job=await client.start(a,randomUUID());await until(async()=> (await client.get(a,job.id)).status==='succeeded');const result=await client.get(a,job.id);assert.equal(JSON.stringify(result).includes(token),false);await assert.rejects(client.get(b,job.id),/JOB_NOT_FOUND/);assert.throws(()=>new PrivateWorkerClient({baseUrl:'http://remote.test',token,allowLoopbackHttp:true}),/CONFIG_INVALID/);
 }finally{await q.close();}
});
test('web controller derives owner, checks boundaries and rejects injected controls',async()=>{
 let authorize=0,upstream=0;const jobs={start:async(ownerId:string,requestId:string)=>{upstream++;assert.equal(ownerId,owner('operator-a'));return {id:requestId,scenario:'paper-packaging' as const,status:'queued' as const,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};},get:async()=>{throw Error();},cancel:async()=>{throw Error();}};
 const deps={enabled:()=>true,authorize:async()=>{authorize++;return {id:'operator-a'};},origin:(req:Request)=>{if(req.headers.get('origin')!=='https://dev.atlas.test')throw new AppError('bad origin',403);},rateLimit:async()=>{},client:()=>jobs};const h=createSponsorHandlers(deps),request=(body:unknown,origin='https://dev.atlas.test')=>new Request('https://dev.atlas.test/api/sponsor-demo',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await h.POST(request({scenario:'paper-packaging'},'https://evil.test'))).status,403);assert.equal(authorize,0);assert.equal(upstream,0);assert.equal((await h.POST(request({scenario:'paper-packaging',ownerId:b}))).status,400);assert.equal(upstream,0);assert.equal((await h.POST(request({scenario:'paper-packaging',workerUrl:'invalid'}))).status,400);assert.equal((await h.POST(request({scenario:'paper-packaging'}))).status,202);assert.equal(upstream,1);const denied=createSponsorHandlers({...deps,authorize:async()=>{throw new AppError('not operator',403);}});assert.equal((await denied.POST(request({scenario:'paper-packaging'}))).status,403);assert.equal(upstream,1);const off=createSponsorHandlers({...deps,enabled:()=>false});assert.equal((await off.GET(new Request('https://dev.atlas.test/api/sponsor-demo?id='+randomUUID()))).status,404);
});
test('invalid receipt and transport mismatch prevent shared-service memory success',async()=>{
 const config={zetarisEnv:'fixture',meterlessTokenFile:'fixture',memoryRoot:root()},dep=syntheticFixtureDependencies();dep.confirm=async()=>({serverRequestId:'wrong',model,localOnly:true,signatureValidWithEmbeddedKey:true});
 const failed=await runSponsorScenario({config,ownerId:a,dependencies:dep});assert.equal(failed.overall,'failed');assert.equal(failed.memory,undefined);assert.equal(failed.failure.code,'SCENARIO_RECEIPT_INVALID');
 const mixed=syntheticFixtureDependencies();mixed.query=async()=>({rows:EXPECTED_ROWS,receipt:{transport:'live'}});const blocked=await runSponsorScenario({config,ownerId:a,dependencies:mixed});assert.equal(blocked.overall,'blocked');assert.equal(blocked.zetaris.code,'SCENARIO_TRANSPORT_MISMATCH');
});
test('untrusted worker responses are projected or rejected, never forwarded wholesale',async()=>{
 const token=randomBytes(32).toString('base64url'),config={baseUrl:'http://127.0.0.1',token,allowLoopbackHttp:true},id=randomUUID(),now=new Date().toISOString();
 const valid={id,scenario:'paper-packaging',status:'queued',createdAt:now,updatedAt:now,token:'private-secret',ownerId:b};
 const projected=await new PrivateWorkerClient(config,async()=>Response.json(valid)).get(a,id);assert.equal(JSON.stringify(projected).includes('private-secret'),false);assert.equal('ownerId' in projected,false);
 const forged={...valid,status:'succeeded',result:{selected:'SYNTH-PAPER-002'}};await assert.rejects(new PrivateWorkerClient(config,async()=>Response.json(forged)).get(a,id),/RESPONSE_INVALID/);
 await assert.rejects(new PrivateWorkerClient(config,async()=>Response.json({error:'PRIVATE_SECRET'},{status:500})).get(a,id),e=>e instanceof Error&&!e.message.includes('PRIVATE_SECRET'));
 await assert.rejects(new PrivateWorkerClient(config,async()=>new Response('x'.repeat(65537))).get(a,id),/RESPONSE_TOO_LARGE/);
});
test('queued cancellation does not pause idle admission and retention is explicit',async()=>{
 let release!:()=>void;const held=new Promise<void>(r=>release=r);const q=await SponsorWorkerQueue.create({root:root(),jobLimit:2,execute:async({id})=>{await held;return fixture(id);}});
 const first=await q.submit(start());await until(()=>q.health().running===1);const input=start(b),queued=await q.submit(input);assert.equal((await q.cancel(queued.id,b)).status,'cancelled');assert.equal(q.health().paused,false);assert.equal((await q.submit(input)).id,queued.id);await assert.rejects(q.submit(start()),/RETENTION_LIMIT/);release();await until(async()=> (await q.get(first.id,a)).status==='succeeded');await q.close();
});
test('web controller, private transport and worker share the same memory-backed service',async()=>{
 const memoryRoot=root(),token=randomBytes(32).toString('base64url');const q=await SponsorWorkerQueue.create({root:root(),execute:job=>runSponsorScenario({config:{zetarisEnv:'fixture',meterlessTokenFile:'fixture',memoryRoot},ownerId:job.ownerId,runId:job.id,signal:job.signal,dependencies:syntheticFixtureDependencies()})});
 const handler=createWorkerHandler(q,token),client=new PrivateWorkerClient({baseUrl:'http://127.0.0.1',token,allowLoopbackHttp:true},async(url,init)=>handler(new Request(String(url),init)));
 const web=createSponsorHandlers({enabled:()=>true,authorize:async()=>({id:'operator-a'}),origin:()=>{},rateLimit:async()=>{},client:()=>client});
 try{
  assert.equal((await handler(new Request('http://127.0.0.1/health',{headers:{Authorization:'Bearer '+'é'.repeat(43)}}))).status,401);
  for(const prior of [0,2]){const response=await web.POST(new Request('https://dev.test/api/sponsor-demo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario:'paper-packaging',requestId:randomUUID()})}));assert.equal(response.status,202);const admitted=await response.json() as any;let result:any;await until(async()=>{const status=await web.GET(new Request('https://dev.test/api/sponsor-demo?id='+admitted.id));assert.equal(status.status,200);result=await status.json();return result.status==='succeeded';});assert.equal(result.result.memory.priorRecallCount,prior);assert.equal(result.result.memory.recallCount,2);assert.equal(result.result.verification,'mock-services-local-memory');}
 }finally{await q.close();}
});