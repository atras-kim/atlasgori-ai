import test from 'node:test';
import assert from 'node:assert/strict';
import {EXPECTED_ROWS,SYNTHETIC_SQL} from '../lib/sponsors/zetaris';
import {ZetarisLocalSyntheticClient} from '../lib/sponsors/zetaris-local';
import {MeterlessSyntheticClient} from '../lib/sponsors/meterless-runtime';
import {selectRuntimePipe,readRuntimeStatus} from '../lib/sponsors/local-runtime';
const local={baseUrl:'http://127.0.0.1:3000',username:'synthetic-user',password:'synthetic-password'};
const fake=(handler:(url:string,init:RequestInit)=>Response|Promise<Response>)=>({fetch:async(url:unknown,init?:RequestInit)=>handler(String(url),init||{})}) as {fetch:typeof fetch};
const fields=['supplier_id','name','product','country'];
const records=EXPECTED_ROWS.map(row=>Object.fromEntries(fields.map((f,i)=>[f,row[i]])));
test('local Zetaris login then fixed query; credentials are not forwarded or returned',async()=>{
 const calls:string[]=[];
 const client=new ZetarisLocalSyntheticClient(local,fake((url,init)=>{
  calls.push(url);assert.equal(init.redirect,'error');const body=JSON.parse(String(init.body));
  if(url.endsWith('/api/auth/login')){assert.deepEqual(body,{username:local.username,password:local.password});return Response.json({idToken:'synthetic-session',orgId:7});}
  assert.equal(url,'http://127.0.0.1:3000/api/proxy/query/sql/start');assert.deepEqual(body,{select:SYNTHETIC_SQL,pageLimit:2});assert.equal(new Headers(init.headers).get('X-Org-ID'),'7');assert.equal(new Headers(init.headers).get('Authorization'),'Bearer synthetic-session');
  return Response.json({records,status:'completed',requestId:'server-query-1'});
 }));const result=await client.query();assert.equal(calls.length,2);assert.deepEqual(result.rows,EXPECTED_ROWS);assert.equal(result.receipt.transport,'mock');assert.equal(result.receipt.serverRequestId,'server-query-1');assert.ok(!JSON.stringify(result).includes(local.password));assert.ok(!JSON.stringify(result).includes('synthetic-session'));
});
test('local Zetaris rejects remote destinations before transmitting credentials',async()=>{
 for(const baseUrl of ['https://remote.test','http://localhost:3000/?x=1','http://localhost:3000/api','http://user@localhost:3000']){
  let count=0;await assert.rejects(new ZetarisLocalSyntheticClient({...local,baseUrl},fake(()=>{count++;return Response.json({});})).query());assert.equal(count,0);
 }
});
test('local Zetaris rejects login HTML, bad session and incomplete or customer query responses',async()=>{
 for(const login of [new Response('<html>login</html>'),Response.json({idToken:'bad\r\nheader',orgId:7}),Response.json({idToken:'token',orgId:'7'}),Response.json({success:false})])await assert.rejects(new ZetarisLocalSyntheticClient(local,fake(()=>login)).query());
 for(const result of [{records,status:'RUNNING'},{records:[{supplier_id:'customer'}]},{records,error:'private-server-error'},{records:records.map(r=>({...r,extra:'private'}))}]){
  await assert.rejects(new ZetarisLocalSyntheticClient(local,fake(url=>Response.json(url.endsWith('/login')?{idToken:'session',orgId:7}:result))).query(),e=>e instanceof Error&&!e.message.includes('private'));
 }
});
test('actual runtime pipe discovery does not depend on LOCALAPPDATA hash and fails on ambiguity',()=>{
 const prefix=String.fromCharCode(92,92,46,92)+'pipe'+String.fromCharCode(92);
 const name='ai.meterless.runtime-85ba9b880f5c-runtime';assert.equal(selectRuntimePipe([name,'other','ai.meterless.runtime-85ba9b880f5c-core']),prefix+name);
 assert.equal(selectRuntimePipe([prefix+name],prefix+name),prefix+name);
 assert.throws(()=>selectRuntimePipe([]),/PIPE_NOT_FOUND/);assert.throws(()=>selectRuntimePipe([name,'ai.meterless.runtime-111111111111-runtime']),/PIPE_AMBIGUOUS/);assert.throws(()=>selectRuntimePipe([name],'\\\\remote\\pipe\\anything'),/PIPE_NOT_FOUND/);
 assert.throws(()=>readRuntimeStatus('http://remote.test'),/PIPE_INVALID/);
});
test('Meterless accepts advertised local-runtime model, verifies local-only and captures server id',async()=>{
 const model='local-runtime/llama-3.2-3b-instruct';
 const config={baseUrl:'http://127.0.0.1:8088/v1',token:'synthetic-token',model,allowLoopbackHttp:true};
 const complete={id:'chatcmpl-synthetic-server',meterless:{privacy:{path:'local-only'}},choices:[{message:{content:'{"selected":"SYNTH-PAPER-002"}'}}]};
 const client=new MeterlessSyntheticClient(config,fake(url=>Response.json(url.endsWith('/models')?{data:[{id:model}]}:complete)));
 const result=await client.reason(EXPECTED_ROWS);assert.equal(result.receipt.serverRequestId,'chatcmpl-synthetic-server');assert.equal(result.receipt.localOnly,true);assert.equal(result.receipt.transport,'mock');
 for(const metadata of [undefined,{privacy:{path:'cloud'}}])await assert.rejects(new MeterlessSyntheticClient(config,fake(url=>Response.json(url.endsWith('/models')?{data:[{id:model}]}:{...complete,meterless:metadata}))).reason(EXPECTED_ROWS),/LOCAL_PRIVACY_UNCONFIRMED/);
 let count=0;await assert.rejects(new MeterlessSyntheticClient({...config,baseUrl:'https://remote.test/v1'},fake(()=>{count++;return Response.json({});})).reason(EXPECTED_ROWS));assert.equal(count,0);
});
test('local Zetaris distinguishes socket permission failure without printing cause',async()=>{
 const transport={fetch:async()=>{throw Object.assign(new Error('private-password'),{cause:{code:'EACCES'}});}} as unknown as {fetch:typeof fetch};
 await assert.rejects(new ZetarisLocalSyntheticClient(local,transport).query(),/ZETARIS_LOCAL_ACCESS_DENIED/);
});

test('runtime status has a total deadline even if socket activity continues',async t=>{
 const http=(await import('node:http')).default;
 const {EventEmitter}=await import('node:events');
 const request=new EventEmitter() as import('node:events').EventEmitter&{setTimeout:()=>void;end:()=>void;destroy:(e:Error)=>void};
 request.setTimeout=()=>{};request.end=()=>{};request.destroy=(e)=>{request.emit('error',e);request.emit('close');};
 t.mock.method(http,'request',()=>request);
 t.mock.timers.enable({apis:['setTimeout']});
 const pipe=selectRuntimePipe(['ai.meterless.runtime-85ba9b880f5c-runtime']);
 const pending=readRuntimeStatus(pipe);const rejected=assert.rejects(pending,/METERLESS_STATUS_TIMEOUT/);
 t.mock.timers.tick(5001);await rejected;
});

test('runtime status refuses cloud providers, configured keys, invalid JSON and oversized replies',async t=>{
 const http=(await import('node:http')).default;
 const {EventEmitter}=await import('node:events');
 const good={keys_configured:[],lanes:[{state:'ready',kind:'local',model:'local-runtime/llama-3.2-3b-instruct'}],version:'1.2.2'};
 const cases=[{...good,keys_configured:['private-key-name']},{...good,lanes:[{state:'ready',kind:'local',model:'local-runtime/llama-3.2-3b-instruct',provider:'external'}]},{...good,lanes:[]},'invalid-json','x'.repeat(65537)];
 for(const body of cases){
  const req=new EventEmitter() as any;const res=new EventEmitter() as any;res.statusCode=200;res.complete=true;
  req.setTimeout=()=>{};req.destroy=(e:Error)=>{req.emit('error',e);req.emit('close');};req.end=()=>{res.emit('data',Buffer.from(typeof body==='string'?body:JSON.stringify(body)));res.emit('end');req.emit('close');};
  const mock=t.mock.method(http,'request',(_options:unknown,callback:(r:unknown)=>void)=>{callback(res);return req;});
  await assert.rejects(readRuntimeStatus(selectRuntimePipe(['ai.meterless.runtime-85ba9b880f5c-runtime'])),e=>e instanceof Error&&!e.message.includes('private-key-name'));
  mock.mock.restore();
 }
});
test('pipe inference is bound to the selected runtime, refuses other URLs and never falls back',async t=>{
 const {runtimePipeFetch,requireReadyLocalModel}=await import('../lib/sponsors/local-runtime');
 const http=(await import('node:http')).default;const {EventEmitter}=await import('node:events');
 const pipe=selectRuntimePipe(['ai.meterless.runtime-85ba9b880f5c-runtime']);
 const optionsSeen:any[]=[];
 const mock=t.mock.method(http,'request',(options:any,callback:(r:unknown)=>void)=>{
  optionsSeen.push(options);const req=new EventEmitter() as any;const res=new EventEmitter() as any;res.statusCode=200;res.complete=true;
  req.setTimeout=()=>{};req.write=()=>{};req.destroy=(e:Error)=>{req.emit('error',e);req.emit('close');};req.end=()=>{callback(res);res.emit('data',Buffer.from('{}'));res.emit('end');req.emit('close');};return req;
 });
 for(const route of ['/models','/chat/completions'])assert.equal((await runtimePipeFetch(pipe,'http://127.0.0.1:8088/v1'+route,{method:route==='/models'?'GET':'POST',headers:{Authorization:'Bearer synthetic-token'},body:route==='/models'?undefined:'{}'})).status,200);
 assert.equal(optionsSeen.length,2);assert.ok(optionsSeen.every(o=>o.socketPath===pipe));assert.deepEqual(optionsSeen.map(o=>o.path),['/v1/models','/v1/chat/completions']);
 await assert.rejects(runtimePipeFetch(pipe,'http://remote.test/v1/models'),/PIPE_ROUTE_INVALID/);assert.equal(optionsSeen.length,2);
 assert.throws(()=>requireReadyLocalModel(['local-runtime/other'],'local-runtime/llama-3.2-3b-instruct'),/SELECTED_MODEL_NOT_READY/);
 mock.mock.restore();
 t.mock.method(http,'request',()=>{throw new Error('pipe denied');});
 await assert.rejects(runtimePipeFetch(pipe,'http://127.0.0.1:8088/v1/models'));
});
test('pipe response statuses with no body fail safely instead of uncaught constructor error',async t=>{
 const {runtimePipeFetch}=await import('../lib/sponsors/local-runtime');const http=(await import('node:http')).default;const {EventEmitter}=await import('node:events');
 for(const code of [204,205,304,101]){
  const req=new EventEmitter() as any;const res=new EventEmitter() as any;res.statusCode=code;res.complete=true;
  req.setTimeout=()=>{};req.destroy=(e:Error)=>{req.emit('error',e);req.emit('close');};req.end=()=>{res.emit('end');req.emit('close');};
  const mock=t.mock.method(http,'request',(_o:unknown,cb:(r:unknown)=>void)=>{cb(res);return req;});
  await assert.rejects(runtimePipeFetch(selectRuntimePipe(['ai.meterless.runtime-85ba9b880f5c-runtime']),'http://127.0.0.1:8088/v1/models'),/METERLESS_PIPE_(EMPTY_RESPONSE|RESPONSE_INVALID)/);mock.mock.restore();
 }
});
test('runtime receipts never return a server id containing the credential',async()=>{
 const model='local-runtime/llama-3.2-3b-instruct',token='synthetic-sensitive-token';
 const client=new MeterlessSyntheticClient({baseUrl:'http://127.0.0.1:8088/v1',token,model,allowLoopbackHttp:true},fake(url=>Response.json(url.endsWith('/models')?{data:[{id:model}]}:{id:'chatcmpl-'+token,meterless:{privacy:{path:'local-only'}},choices:[{message:{content:'{"selected":"SYNTH-PAPER-002"}'}}]})));
 const result=await client.reason(EXPECTED_ROWS);assert.equal(result.receipt.serverRequestId,undefined);assert.equal(JSON.stringify(result).includes(token),false);
});
test('pipe close and upgrade without a response callback terminate and destroy upgrade sockets',async t=>{
 const {runtimePipeFetch}=await import('../lib/sponsors/local-runtime');const http=(await import('node:http')).default;const {EventEmitter}=await import('node:events');
 const pipe=selectRuntimePipe(['ai.meterless.runtime-85ba9b880f5c-runtime']);
 for(const which of ['status','inference'])for(const event of ['close','upgrade']){
  const req=new EventEmitter() as any;let destroyed=false;
  req.setTimeout=()=>{};req.destroy=(e:Error)=>{req.emit('error',e);req.emit('close');};req.end=()=>{if(event==='upgrade'){req.emit('upgrade',{}, {destroy:()=>{destroyed=true;}});}else req.emit('close');};
  const mock=t.mock.method(http,'request',()=>req);
  const pending=which==='status'?readRuntimeStatus(pipe):runtimePipeFetch(pipe,'http://127.0.0.1:8088/v1/models');
  await assert.rejects(pending,event==='upgrade'?/UNEXPECTED_UPGRADE/:/CLOSED_WITHOUT_RESPONSE/);
  if(event==='upgrade'){assert.equal(destroyed,true);req.emit('close');}
  mock.mock.restore();
 }
});
test('unknown ready local GGUF lane remains blocked without exposing private fields',async t=>{
 const http=(await import('node:http')).default;const {EventEmitter}=await import('node:events');
 const req=new EventEmitter() as any,res=new EventEmitter() as any;res.statusCode=200;res.complete=true;
 const body={keys_configured:[],lanes:[{state:'ready',kind:'local',model:'Llama-Unknown-Q4.gguf',token:'private-do-not-print',path:'private-path'}]};
 req.setTimeout=()=>{};req.destroy=(e:Error)=>{req.emit('error',e);req.emit('close');};req.end=()=>{res.emit('data',Buffer.from(JSON.stringify(body)));res.emit('end');req.emit('close');};
 t.mock.method(http,'request',(_o:unknown,cb:(r:unknown)=>void)=>{cb(res);return req;});
 await assert.rejects(readRuntimeStatus(selectRuntimePipe(['ai.meterless.runtime-85ba9b880f5c-runtime'])),(e:any)=>{
  assert.equal(e.code,'METERLESS_MODEL_ID_MAPPING_UNCONFIRMED');assert.equal(e.diagnostics.readyLocalLaneCount,1);assert.equal(e.diagnostics.lanes[0].model,body.lanes[0].model);assert.ok(!JSON.stringify(e.diagnostics).includes('private'));return true;
 });
});
test('only corroborated exact GGUF alias maps to API id, while API discovery is still mandatory',async t=>{
 const {canonicalLocalModelId}=await import('../lib/sponsors/local-runtime');
 const file='Llama-3.2-3B-Instruct-Q4_K_M.gguf',model='local-runtime/llama-3.2-3b-instruct';
 assert.equal(canonicalLocalModelId(file),model);assert.equal(canonicalLocalModelId(model),model);
 for(const invalid of ['Llama-Unknown-Q4.gguf','C:/private/'+file,file+'\n',null])assert.equal(canonicalLocalModelId(invalid),undefined);
 const http=(await import('node:http')).default;const {EventEmitter}=await import('node:events');
 const req=new EventEmitter() as any,res=new EventEmitter() as any;res.statusCode=200;res.complete=true;
 req.setTimeout=()=>{};req.destroy=(e:Error)=>{req.emit('error',e);req.emit('close');};req.end=()=>{res.emit('data',Buffer.from(JSON.stringify({keys_configured:[],version:'1.2.2',lanes:[{state:'ready',kind:'local',model:file}]})));res.emit('end');req.emit('close');};
 t.mock.method(http,'request',(_o:unknown,cb:(r:unknown)=>void)=>{cb(res);return req;});
 const status=await readRuntimeStatus(selectRuntimePipe(['ai.meterless.runtime-85ba9b880f5c-runtime']));assert.deepEqual(status.localModels,[model]);
 let requests=0;const client=new MeterlessSyntheticClient({baseUrl:'http://127.0.0.1:8088/v1',token:'synthetic-token',model,allowLoopbackHttp:true},fake(()=>{requests++;return Response.json({data:[{id:'local-runtime/other'}]});}));
 await assert.rejects(client.reason(EXPECTED_ROWS),/MODEL_UNAVAILABLE/);assert.equal(requests,1);
});
test('Meterless null and primitive JSON returns safe phase diagnostics, never generic TypeError',async()=>{
 const model='local-runtime/llama-3.2-3b-instruct';
 for(const payload of [null,[],false,42,'private-server-text']){
  const client=new MeterlessSyntheticClient({baseUrl:'http://127.0.0.1:8088/v1',token:'synthetic-token',model,allowLoopbackHttp:true},fake(()=>Response.json(payload)));
  await assert.rejects(client.reason(EXPECTED_ROWS),(e:any)=>{assert.equal(e.code,'METERLESS_INVALID_RESPONSE');assert.equal(e.diagnostics.phase,'model-discovery');assert.equal(JSON.stringify(e.diagnostics).includes('private'),false);return true;});
 }
});

test('Meterless HTTP failure records only status and phase; explicit token errors are sanitized',async()=>{
 const {readExplicitRuntimeToken}=await import('../lib/sponsors/local-runtime');
 const client=new MeterlessSyntheticClient({baseUrl:'http://127.0.0.1:8088/v1',token:'synthetic-token',model:'local-runtime/llama-3.2-3b-instruct',allowLoopbackHttp:true},fake(()=>new Response('private-token-detail',{status:404})));
 await assert.rejects(client.reason(EXPECTED_ROWS),(e:any)=>{assert.equal(e.code,'METERLESS_HTTP_FAILURE');assert.deepEqual(e.diagnostics,{phase:'model-discovery',httpStatus:404});return true;});
 await assert.rejects(readExplicitRuntimeToken('C:/nonexistent-atlas-synthetic-token-file'),e=>e instanceof Error&&e.message==='METERLESS_TOKEN_FILE_NOT_FOUND');
});
test('live runtime evidence requires signed matching app, id, model, privacy and fresh timestamp',async()=>{
 const {verifyMatchingRuntimeReceipt}=await import('../lib/sponsors/local-runtime');const {generateKeyPairSync,sign}=await import('node:crypto');
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');const pubkey_b64=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
 const now=Date.now(),expected={requestId:'chatcmpl-synthetic-evidence',model:'local-runtime/llama-3.2-3b-instruct',startedAt:now};
 const body={ts_ms:now,receipt:{app:'atlasgori-synthetic-demo',request_id:expected.requestId,status:'ok',privacy:{path:'local-only'},winning_route:{kind:'local',model:expected.model},prompt_preview:'private-not-returned'}};
 const doc={body,pubkey_b64,sig_b64:sign(null,Buffer.from(JSON.stringify(body)),privateKey).toString('base64')};
 const result=verifyMatchingRuntimeReceipt(doc,expected);assert.equal(result?.signatureValidWithEmbeddedKey,true);assert.ok(!JSON.stringify(result).includes('private'));
 assert.equal(verifyMatchingRuntimeReceipt(doc,{...expected,requestId:'other'}),undefined);assert.equal(verifyMatchingRuntimeReceipt(doc,{...expected,model:'local-runtime/other'}),undefined);assert.equal(verifyMatchingRuntimeReceipt(doc,{...expected,startedAt:now+5000}),undefined);
 assert.equal(verifyMatchingRuntimeReceipt({...doc,body:{...body,receipt:{...body.receipt,status:'failed'}}},expected),undefined);
 assert.equal(verifyMatchingRuntimeReceipt({...doc,sig_b64:Buffer.alloc(64).toString('base64')},expected),undefined);
});
test('synthetic reasoning requests bounded concise JSON and hides unexpected model text',async()=>{
 const model='local-runtime/llama-3.2-3b-instruct';
 const client=new MeterlessSyntheticClient({baseUrl:'http://127.0.0.1:8088/v1',token:'synthetic-token',model,allowLoopbackHttp:true},fake((url,init)=>{
  if(url.endsWith('/models'))return Response.json({data:[{id:model}]});
  const body=JSON.parse(String(init.body));assert.equal(body.max_tokens,256);assert.ok(body.messages.some((m:any)=>m.role==='system'&&m.content.includes('exactly one key')));assert.equal(body.temperature,0);assert.equal(body.response_format.type,'json_object');
  return Response.json({id:'chatcmpl-synthetic-unexpected',meterless:{privacy:{path:'local-only'}},choices:[{finish_reason:'stop',message:{content:'private-response-text-not-a-fixture'}}]});
 }));
 await assert.rejects(client.reason(EXPECTED_ROWS),(e:any)=>{assert.equal(e.code,'METERLESS_UNEXPECTED_SYNTHETIC_RESULT');assert.equal(e.diagnostics.phase,'synthetic-selection-validation');assert.equal(e.diagnostics.jsonParsed,false);assert.equal(e.diagnostics.serverRequestId,'chatcmpl-synthetic-unexpected');assert.ok(!JSON.stringify(e.diagnostics).includes('private-response'));return true;});
});
test('only a full single JSON fence is normalized; prose, extra keys, duplicates and wrong answers fail',async()=>{
 const {syntheticSelectionJson}=await import('../lib/sponsors/meterless-runtime');
 const fenced='```json\n{\n  "selected": "SYNTH-PAPER-002"\n}\n```';assert.equal(fenced.length,47);
 assert.equal(syntheticSelectionJson(fenced).format,'json-fence');
 const model='local-runtime/llama-3.2-3b-instruct',config={baseUrl:'http://127.0.0.1:8088/v1',token:'synthetic-token',model,allowLoopbackHttp:true};
 const clientFor=(content:string)=>new MeterlessSyntheticClient(config,fake(url=>Response.json(url.endsWith('/models')?{data:[{id:model}]}:{id:'chatcmpl-fixture',meterless:{privacy:{path:'local-only'}},choices:[{message:{content}}]})));
 const result=await clientFor(fenced).reason(EXPECTED_ROWS);assert.equal(result.selected,'SYNTH-PAPER-002');assert.equal(result.receipt.responseFormat,'json-fence');
 for(const invalid of ['Explanation\n'+fenced,fenced+'\nExplanation','{"selected":"SYNTH-PAPER-002","extra":"private"}','{"selected":"SYNTH-PAPER-001","selected":"SYNTH-PAPER-002"}','{"selected":"SYNTH-PAPER-001"}','```json\n{"selected":"SYNTH-PAPER-002"}\n```\n```json\n{}\n```'])await assert.rejects(clientFor(invalid).reason(EXPECTED_ROWS),/UNEXPECTED_SYNTHETIC_RESULT/);
});