import test from 'node:test';
import assert from 'node:assert/strict';
import {EXPECTED_ROWS,SYNTHETIC_SQL,ZetarisSyntheticClient,readZetarisConfig} from '../lib/sponsors/zetaris';
import {MeterlessSyntheticClient,readMeterlessConfig} from '../lib/sponsors/meterless-runtime';
const config={restUrl:'https://zetaris.test/api/v1.0',orgId:'1',apiKey:'synthetic-secret'};
const meter={baseUrl:'https://meterless.test/v1',token:'synthetic-runtime-secret',model:'meterless/auto'};
const fake=(handler:(url:string,init:RequestInit)=>Response|Promise<Response>)=>({fetch:async(url:unknown,init?:RequestInit)=>handler(String(url),init||{})}) as {fetch:typeof fetch};
const json=(value:unknown)=>Response.json(value);
test('Zetaris official run contract, fixed SQL and sanitized receipt',async()=>{
 const client=new ZetarisSyntheticClient(config,fake((url,init)=>{
  assert.equal(url,'https://zetaris.test/api/v1.0/sql-editor/sqls/run');assert.equal(init.redirect,'error');
  const h=new Headers(init.headers);assert.equal(h.get('Authorization'),'Bearer synthetic-secret');assert.equal(h.get('X-Org-ID'),'1');assert.ok(h.get('X-Request-ID'));
  const b=JSON.parse(String(init.body));assert.equal(b.sql,SYNTHETIC_SQL);assert.equal(b.source,'SqlEditor');assert.equal(b.limit,2);assert.ok(b.queryId);
  return json({data:EXPECTED_ROWS});
 }));const result=await client.query();assert.equal(result.receipt.status,'mock-contract-tested');assert.equal(result.receipt.transport,'mock');assert.equal(JSON.stringify(result).includes('synthetic-secret'),false);
});
test('Zetaris rejects auth errors, unexpected/customer payloads and oversized data',async()=>{
 for(const response of [new Response('secret',{status:401}),json({data:[['customer-private']]}),json({error:'private',data:EXPECTED_ROWS}),new Response('x'.repeat(70000))]){
  await assert.rejects(new ZetarisSyntheticClient(config,fake(()=>response)).query(),e=>e instanceof Error&&!e.message.includes('private')&&!e.message.includes('secret'));
 }
});
test('Zetaris rejects insecure non-loopback and missing configuration before request',async()=>{
 assert.throws(()=>readZetarisConfig({}));let requests=0;
 await assert.rejects(new ZetarisSyntheticClient({...config,restUrl:'http://remote.test/api/v1.0',allowLoopbackHttp:true},fake(()=>{requests++;return json({});})).query());assert.equal(requests,0);
});
test('Meterless authenticates discovery and completion; consumes only exact synthetic rows',async()=>{
 const requests:string[]=[];const client=new MeterlessSyntheticClient(meter,fake((url,init)=>{
  requests.push(url);const h=new Headers(init.headers);assert.equal(h.get('Authorization'),'Bearer synthetic-runtime-secret');assert.equal(h.get('meterless-app'),'atlasgori-synthetic-demo');assert.equal(h.get('meterless-scope'),'user');assert.equal(init.redirect,'error');
  if(url.endsWith('/models'))return json({data:[{id:'meterless/auto'}]});
  const b=JSON.parse(String(init.body));assert.equal(b.model,'meterless/auto');assert.equal(b.stream,false);assert.ok(b.messages.find((m:{role:string})=>m.role==='user').content.includes('Synthetic Blue Box'));
  return json({choices:[{message:{content:'{"selected":"SYNTH-PAPER-002"}'}}]});
 }));const result=await client.reason(EXPECTED_ROWS);assert.equal(result.receipt.status,'mock-contract-tested');assert.equal(result.selected,'SYNTH-PAPER-002');assert.equal(requests.length,2);assert.equal(JSON.stringify(result).includes(meter.token),false);
});
test('Meterless does not transmit non-synthetic input',async()=>{
 let requests=0;await assert.rejects(new MeterlessSyntheticClient(meter,fake(()=>{requests++;return json({});})).reason([['customer-private']]));assert.equal(requests,0);
});
test('Meterless fails closed on missing config, placeholder token, unauthorized runtime, wrong model and wrong answer',async()=>{
 assert.throws(()=>readMeterlessConfig({}));
 await assert.rejects(new MeterlessSyntheticClient({...meter,token:'rt-local'},fake(()=>json({}))).reason(EXPECTED_ROWS));
 await assert.rejects(new MeterlessSyntheticClient(meter,fake(()=>new Response('key',{status:403}))).reason(EXPECTED_ROWS),/METERLESS_UNAUTHORIZED/);
 await assert.rejects(new MeterlessSyntheticClient(meter,fake(()=>json({data:[{id:'other'}]}))).reason(EXPECTED_ROWS),/METERLESS_MODEL_UNAVAILABLE/);
 await assert.rejects(new MeterlessSyntheticClient(meter,fake(url=>url.endsWith('/models')?json({data:[{id:'meterless/auto'}]}):json({choices:[{message:{content:'private-response'}}]}))).reason(EXPECTED_ROWS),/METERLESS_UNEXPECTED_SYNTHETIC_RESULT/);
});
test('Meterless discovery timeout is short; inference retains 180-second budget',async()=>{
 const timeout=AbortSignal.timeout;const budgets:number[]=[];
 AbortSignal.timeout=(ms:number)=>{budgets.push(ms);return timeout(ms);};
 try{const client=new MeterlessSyntheticClient(meter,fake(url=>url.endsWith('/models')?json({data:[{id:'meterless/auto'}]}):json({choices:[{message:{content:'{"selected":"SYNTH-PAPER-002"}'}}]})));await client.reason(EXPECTED_ROWS);assert.deepEqual(budgets,[15000,180000]);}
 finally{AbortSignal.timeout=timeout;}
});
