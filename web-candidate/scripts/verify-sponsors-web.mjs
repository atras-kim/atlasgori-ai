// Isolated loopback web verification. Auth dependency is explicitly synthetic;
// Zetaris, Meterless and H-MEM use real local services/files. No production env.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {SponsorWorkerQueue} from '../lib/sponsors/worker-queue.ts';
import {createWorkerServer,listenPrivateWorker,closePrivateWorker} from '../lib/sponsors/worker-server.ts';
import {runSponsorScenario} from '../lib/sponsors/scenario-service.ts';
const root=process.cwd(),runId=randomUUID(),evidence=path.join(root,'.runtime','web-verification',runId);
await fs.mkdir(evidence,{recursive:true});
async function sourceManifest(){
 const files={};async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){if(['node_modules','.next','.runtime','.git'].includes(e.name)||e.name==='tsconfig.tsbuildinfo')continue;const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else if(e.isFile())files[path.relative(root,p).replaceAll('\\','/')]=createHash('sha256').update(await fs.readFile(p)).digest('hex');}}
 await walk(root);return Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)));
}
const sourceBefore=await sourceManifest();
const userId='11111111-1111-4111-8111-111111111111',otherId='22222222-2222-4222-8222-222222222222';
const identity=(id)=>({id,aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'});
const expiresAt=Math.floor(Date.now()/1000)+7200;
const jwt=(id)=>Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,role:'authenticated',exp:expiresAt})).toString('base64url')+'.synthetic-fixture-signature';
const cookie=(id)=>'sb-127-auth-token=base64-'+Buffer.from(JSON.stringify({access_token:jwt(id),refresh_token:'synthetic-fixture',expires_at:Math.floor(Date.now()/1000)+7200,expires_in:7200,token_type:'bearer',user:identity(id)})).toString('base64url');
const fixtureCalls=[];let rate=0;
const fixture=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://fixture');let body='';for await(const b of req)body+=b;
 fixtureCalls.push({method:req.method,path:u.pathname});
 res.setHeader('content-type','application/json');
 const send=(code,data)=>{res.statusCode=code;res.end(JSON.stringify(data));};
 if(u.pathname==='/auth/v1/user'&&req.method==='GET'){
  const id=[userId,otherId].find(id=>req.headers.authorization==='Bearer '+jwt(id));
  return id?send(200,identity(id)):send(401,{message:'Synthetic session required'});
 }
 if(u.pathname==='/rest/v1/app_members'&&req.method==='GET'&&['state','is_operator,state'].includes(u.searchParams.get('select'))){
  const id=[userId,otherId].find(id=>u.searchParams.get('id')==='eq.'+id);
  if(!id)return send(403,{message:'Synthetic identity only'});
  return send(200,u.searchParams.get('select')==='state'?{state:'active'}:{state:'active',is_operator:id===userId});
 }
 if(u.pathname==='/rest/v1/rpc/take_rate_slot'&&req.method==='POST'){
  let data;try{data=JSON.parse(body);}catch{return send(400,{});}
  if(data.p_user!==userId)return send(403,{});
  if(data.p_bucket==='sponsor-job-status'&&data.p_max===300)return send(200,true);
  if(data.p_bucket!=='sponsor-demo'||data.p_max!==2)return send(403,{});
  return send(200,++rate<=2);
 }
 return send(404,{message:'Unexpected fixture request'});
});
await new Promise((resolve,reject)=>{fixture.once('error',reject);fixture.listen(0,'127.0.0.1',resolve);});
const fixtureUrl='http://127.0.0.1:'+fixture.address().port,origin='http://127.0.0.1:4318';
let app,worker,queue;let logs='';
const report={runId,startedAt:new Date().toISOString(),auth:'local synthetic Supabase dependency fixture; not real Supabase',checks:{}};
try{
 const local=process.env.LOCALAPPDATA;let h=0xcbf29ce484222325n;for(const b of Buffer.from(local.toLowerCase()))h=((h^BigInt(b))*0x100000001b3n)&0xffffffffffffffffn;
 const pipe=`\\\\.\\pipe\\ai.meterless.runtime-${(h&0xffffffffffffn).toString(16).padStart(12,'0')}-runtime`;
 const state=await new Promise((resolve,reject)=>{const req=http.request({socketPath:pipe,path:'/admin/status',method:'GET',headers:{host:'meterlessd'}},r=>{let s='';r.on('data',b=>s+=b);r.on('end',()=>{try{if(r.statusCode!==200)throw Error();resolve(JSON.parse(s));}catch{reject(Error('RUNTIME_STATUS_FAILED'));}});});req.setTimeout(5000,()=>req.destroy(Error('RUNTIME_STATUS_FAILED')));req.on('error',reject);req.end();});
 assert.equal((state.keys_configured||[]).length,0);assert.ok(!(state.lanes||[]).some(l=>l.provider));assert.ok(state.lanes.some(l=>l.kind==='local'&&l.state==='ready'));
 const systemEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(path|systemroot|windir|comspec|temp|tmp|localappdata|appdata|userprofile|pathext)$/i.test(k)));
 const env={...systemEnv,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',ATLAS_APP_URL:origin,ATLAS_SPONSOR_DEMO_ENABLED:'1',NEXT_PUBLIC_SUPABASE_URL:fixtureUrl,NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'};
 const config={zetarisEnv:'C:/AI/Ruflo-HQ/.runtime/zetaris/zetaris-platform/.env',meterlessTokenFile:path.join(local,'ai.meterless.runtime','proxy-token'),memoryRoot:path.join(evidence,'memory')};
 const scenarioReports=[];
 queue=await SponsorWorkerQueue.create({root:path.join(evidence,'queue'),execute:async job=>{const r=await runSponsorScenario({config,ownerId:job.ownerId,runId:job.id,signal:job.signal});scenarioReports.push(r);return r;}});
 const workerToken='synthetic-fixture-worker-'+randomUUID().replaceAll('-','');
 worker=createWorkerServer(queue,workerToken);env.ATLAS_WORKER_URL=await listenPrivateWorker(worker);env.ATLAS_WORKER_TOKEN=workerToken;env.ATLAS_WORKER_ALLOW_LOOPBACK_HTTP='1';
 report.checks.workerUnauthorized=(await fetch(env.ATLAS_WORKER_URL+'/health')).status;assert.equal(report.checks.workerUnauthorized,401);
 const start=async()=>{
  app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','4318'],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  app.stdout.on('data',b=>logs+=b);app.stderr.on('data',b=>logs+=b);
  for(let i=0;i<100;i++){
   if(app.exitCode!==null)throw Error('APP_EXIT');
   try{const r=await fetch(origin+'/sponsor-demo',{headers:{Cookie:cookie(userId)}});if(r.status===200){const html=await r.text();assert.ok(html.includes('/api/sponsor-demo')||html.includes('합성 데이터'));return;}}catch{}
   await new Promise(r=>setTimeout(r,300));
  }throw Error('APP_START_TIMEOUT');
 };
 const stop=async()=>{if(app&&app.exitCode===null){const child=app;child.kill();await new Promise(r=>child.once('exit',r));}app=undefined;};
 const post=async(headers={})=>{
  const r=await fetch(origin+'/api/sponsor-demo',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify({scenario:'paper-packaging'}),signal:AbortSignal.timeout(240000)});
  return {status:r.status,body:await r.json()};
 };
 const run=async()=>{
  const admitted=await post({Cookie:cookie(userId)});assert.equal(admitted.status,202,JSON.stringify(admitted.body));
  for(let i=0;i<480;i++){
   const r=await fetch(origin+'/api/sponsor-demo?id='+admitted.body.id,{headers:{Cookie:cookie(userId),Origin:origin}});assert.equal(r.status,200);
   const job=await r.json();if(!['queued','running'].includes(job.status)){assert.equal(job.status,'succeeded',JSON.stringify({job,scenarioReports}));return job.result;}
   await new Promise(r=>setTimeout(r,500));
  }throw Error('JOB_TIMEOUT');
 };
 await start();report.checks.page200=true;
 report.checks.unauthenticated=(await post()).status;assert.equal(report.checks.unauthenticated,401);
 report.checks.foreignOrigin=(await post({Origin:'https://foreign.invalid'})).status;assert.equal(report.checks.foreignOrigin,403);
 report.checks.nonOperator=(await post({Cookie:cookie(otherId)})).status;assert.equal(report.checks.nonOperator,403);
 const first=await run();report.first=first;
 assert.equal(first.verification,'live-synthetic-services');assert.equal(first.memory.priorRecallCount,0);assert.equal(first.memory.recallCount,2);
 await stop();report.checks.processRestart=true;await start();
 const second=await run();report.second=second;
 assert.equal(second.memory.priorRecallCount,2);assert.equal(second.memory.recallCount,2);
 for(const r of [first,second]){assert.equal(r.verification,'live-synthetic-services');assert.equal(r.zetarisRows,2);assert.equal(r.localOnly,true);assert.equal(r.selected,'SYNTH-PAPER-002');assert.equal(r.signatureValidWithEmbeddedKey,true);}
 report.scenarios=scenarioReports;
 report.checks.rateLimited=(await post({Cookie:cookie(userId)})).status;assert.equal(report.checks.rateLimited,429);
 const responseIds=[first.serverRequestId,second.serverRequestId];
 assert.ok(responseIds.every(Boolean));
 const traffic=(await fs.readFile(path.join(local,'ai.meterless.runtime','receipts.jsonl'),'utf8')).trim().split(/\r?\n/).map(JSON.parse).filter(x=>responseIds.includes(x.body?.receipt?.request_id)).map(x=>{
  const r=x.body.receipt;assert.equal(r.privacy?.path,'local-only');assert.equal(r.egress?.destination,'none');assert.equal(r.status,'ok');
  return {requestId:r.request_id,receiptId:r.receipt_id,status:r.status,privacy:r.privacy.path,egress:r.egress.destination,route:r.winning_route,usage:r.usage,actualCostUsd:r.cost?.actual_usd};
 });
 assert.ok(responseIds.every(id=>traffic.some(r=>r.requestId===id)));report.runtimeTraffic=traffic;
 await stop();
 await queue.close();queue=undefined;await closePrivateWorker(worker);worker=undefined;
 const ownerId='synthetic-'+createHash('sha256').update(userId).digest('hex');
 const memoryChild=spawn(process.execPath,['--import','tsx','scripts/read-sponsor-memory.ts',config.memoryRoot,ownerId],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let memoryOutput='';memoryChild.stdout.on('data',b=>memoryOutput+=b);const memoryCode=await new Promise(r=>memoryChild.once('exit',r));assert.equal(memoryCode,0);report.memoryProcess=JSON.parse(memoryOutput);assert.equal(report.memoryProcess.recallCount,2);assert.equal(report.memoryProcess.fixedSyntheticIdsOnly,true);
 const journalFiles=[];async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else journalFiles.push(p);}}await walk(path.join(evidence,'memory'));
 report.journals=await Promise.all(journalFiles.map(async p=>({path:path.relative(evidence,p),sha256:createHash('sha256').update(await fs.readFile(p)).digest('hex')})));
 report.status='PASS';
}catch(e){report.status='FAIL';report.error=e instanceof assert.AssertionError?String(e.message).slice(0,500):['APP_EXIT','APP_START_TIMEOUT','RUNTIME_STATUS_FAILED'].includes(e.message)?e.message:'LOCAL_WEB_VERIFICATION_FAILED';process.exitCode=1;}
finally{
 if(app&&app.exitCode===null){const child=app;child.kill();await new Promise(r=>child.once('exit',r));}
 if(queue)await queue.close();if(worker)await closePrivateWorker(worker);
 await new Promise(r=>fixture.close(r));
 report.completedAt=new Date().toISOString();report.fixtureCalls=fixtureCalls;
 const sourceAfter=await sourceManifest();report.sourceUnchanged=JSON.stringify(sourceBefore)===JSON.stringify(sourceAfter);
 if(!report.sourceUnchanged){report.status='FAIL';report.error='SOURCE_CHANGED_DURING_VERIFICATION';process.exitCode=1;}
 report.sourceSha256=createHash('sha256').update(JSON.stringify(sourceBefore)).digest('hex');
 report.buildId=(await fs.readFile(path.join(root,'.next','BUILD_ID'),'utf8')).trim();
 report.buildArtifacts={};for(const p of ['server/app/api/sponsor-demo/route.js','server/app/sponsor-demo/page.js'])report.buildArtifacts[p]=createHash('sha256').update(await fs.readFile(path.join(root,'.next',p))).digest('hex');
 await fs.writeFile(path.join(evidence,'source-manifest.json'),JSON.stringify(sourceBefore,null,2));
 await fs.writeFile(path.join(evidence,'receipt.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({status:report.status,evidence,checks:report.checks,error:report.error,first:report.first,second:report.second,runtimeTraffic:report.runtimeTraffic},null,2));
}
