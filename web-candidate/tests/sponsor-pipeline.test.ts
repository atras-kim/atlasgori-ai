import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runSyntheticIntegration} from '../lib/sponsors/pipeline';
import {EXPECTED_ROWS,ZetarisSyntheticClient} from '../lib/sponsors/zetaris';
import {MeterlessSyntheticClient} from '../lib/sponsors/meterless-runtime';
const mock={fetch:async()=>Response.json({data:EXPECTED_ROWS})} as {fetch:typeof fetch};
const runtimeMock={fetch:async(url:unknown)=>Response.json(String(url).endsWith('/models')?{data:[{id:'meterless/auto'}]}:{choices:[{message:{content:'{"selected":"SYNTH-PAPER-002"}'}}]})} as {fetch:typeof fetch};
const clients=()=>({zetaris:new ZetarisSyntheticClient({restUrl:'https://zetaris.test/api/v1.0',orgId:'1',apiKey:'synthetic-key'},mock),meterless:new MeterlessSyntheticClient({baseUrl:'https://meterless.test/v1',token:'synthetic-token',model:'meterless/auto'},runtimeMock)});
test('Zetaris -> Meterless Runtime -> persistent memory, cold/warm and owner isolation',async()=>{
 const memoryRoot=await mkdtemp(join(tmpdir(),'atlas-sponsor-pipeline-'));
 const cold=await runSyntheticIntegration({...clients(),memoryRoot,ownerId:'synthetic-owner-a'});
 assert.equal(cold.verification,'mock-services-local-memory');assert.equal(cold.memory.priorRecallCount,0);assert.equal(cold.memory.recallCount,2);assert.equal(cold.memory.persistedAcrossInstances,true);assert.equal(cold.recommendation.supplierId,'SYNTH-PAPER-002');
 const warm=await runSyntheticIntegration({...clients(),memoryRoot,ownerId:'synthetic-owner-a'});
 assert.equal(warm.memory.priorRecallCount,2);assert.ok(warm.memory.ledgerEntries>cold.memory.ledgerEntries);assert.notEqual(warm.runId,cold.runId);assert.equal(warm.zetaris.status,'mock-contract-tested');assert.equal(warm.meterless.status,'mock-contract-tested');
 const other=await runSyntheticIntegration({...clients(),memoryRoot,ownerId:'synthetic-owner-b'});assert.equal(other.memory.priorRecallCount,0);
 assert.ok(cold.memory.matches.every(m=>m.lineage.origin==='synthetic_fixture'));assert.equal(JSON.stringify(cold).includes('synthetic-key'),false);
});
test('failed Zetaris request prevents Runtime call and cannot produce success receipt',async()=>{
 let calls=0;const memoryRoot=await mkdtemp(join(tmpdir(),'atlas-sponsor-failure-'));
 const zetaris=new ZetarisSyntheticClient({restUrl:'https://zetaris.test/api/v1.0',orgId:'1',apiKey:'synthetic-key'},{fetch:async()=>new Response('',{status:401})} as {fetch:typeof fetch});
 const meterless=new MeterlessSyntheticClient({baseUrl:'https://meterless.test/v1',token:'synthetic-token',model:'meterless/auto'},{fetch:async()=>{calls++;return Response.json({});}} as {fetch:typeof fetch});
 await assert.rejects(runSyntheticIntegration({zetaris,meterless,memoryRoot,ownerId:'synthetic-failure'}),/ZETARIS_UNAUTHORIZED/);assert.equal(calls,0);
});
