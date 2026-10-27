import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SyntheticHmem} from '../lib/sponsors/meterless-memory';
const scope={ownerId:'synthetic-owner-a',namespace:'sponsor-demo' as const,projectId:'synthetic-paper',runId:'synthetic-run-cold'};
async function fixture(fn:(root:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'atlas-hmem-test-'));try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
test('cold versus warm: fresh instance retains provenance and append-only audit',()=>fixture(async root=>{
 const cold=new SyntheticHmem(root,scope);assert.deepEqual(await cold.recall('paper-packaging'),[]);await cold.remember('paper-packaging-001');const before=await cold.audit();
 const warm=new SyntheticHmem(root,{...scope,runId:'synthetic-run-warm'});const hits=await warm.recall('paper-packaging');assert.equal(hits.length,1);assert.equal(hits[0].id,'paper-packaging-001');assert.equal(hits[0].source,'synthetic-catalog:paper-packaging-001');assert.equal(hits[0].provenance.origin,'synthetic_fixture');assert.match(hits[0].retrievalReason,/keyword=.*confidence=1/);assert.ok(hits[0].score>=.35);
 const after=await warm.audit();assert.deepEqual(after.slice(0,before.length),before);assert.equal(after.at(-1)?.action,'read');assert.equal(after.at(-1)?.runId,'synthetic-run-warm');
}));
test('owner and project isolation',()=>fixture(async root=>{
 const first=new SyntheticHmem(root,scope);await first.remember('paper-packaging-001');for(const other of [{...scope,ownerId:'synthetic-owner-b'},{...scope,projectId:'synthetic-other'}]){const isolated=new SyntheticHmem(root,other);assert.deepEqual(await isolated.recall('paper-packaging'),[]);assert.notEqual(isolated.directory,first.directory);}
}));
test('reject arbitrary text and missing mandatory source',()=>fixture(async root=>{
 const store=new SyntheticHmem(root,scope);await assert.rejects(store.remember({content:'customer secret'} as never),/canonical synthetic/);await assert.rejects(store.recall('customer secret' as never),/canonical synthetic/);await store.remember('paper-packaging-001');const path=join(store.directory,'journal.jsonl');const data=JSON.parse(await readFile(path,'utf8'));delete data.snapshot.memories[0].source;await writeFile(path,JSON.stringify(data)+'\n');await assert.rejects(store.recall('paper-packaging'),/mandatory source/);
}));
test('corrupt storage and external lock fail closed without reset',()=>fixture(async root=>{
 const store=new SyntheticHmem(root,scope);await store.remember('paper-packaging-001');const path=join(store.directory,'journal.jsonl');await writeFile(path,'{broken');await assert.rejects(store.recall('paper-packaging'),/Corrupt H-MEM journal/);assert.equal(await readFile(path,'utf8'),'{broken');await writeFile(join(store.directory,'store.lock'),'lock');await assert.rejects(store.recall('paper-packaging'),/locked; fail closed/);
}));
test('concurrent instances avoid duplicate records and lost ledger events',()=>fixture(async root=>{
 const a=new SyntheticHmem(root,scope),b=new SyntheticHmem(root,{...scope,runId:'synthetic-run-b'});await Promise.all([a.remember('paper-packaging-001'),b.remember('paper-packaging-002'),a.remember('paper-packaging-001')]);const [one,two]=await Promise.all([a.recall('paper-packaging'),b.recall('paper-packaging')]);assert.equal(one.length,2);assert.equal(two.length,2);assert.equal((await a.audit()).filter(e=>e.action==='create').length,2);const persisted=await readFile(join(a.directory,'journal.jsonl'),'utf8');assert.ok(!persisted.includes('customer secret'));assert.ok(!persisted.includes('api_key'));
}));

test('journal commits are append-only and chain tampering fails closed',()=>fixture(async root=>{
 const store=new SyntheticHmem(root,scope);await store.remember('paper-packaging-001');const path=join(store.directory,'journal.jsonl');const first=await readFile(path,'utf8');await store.recall('paper-packaging');const second=await readFile(path,'utf8');assert.ok(second.startsWith(first));const lines=second.trimEnd().split('\n');const frame=JSON.parse(lines[1]);frame.previousHash='forged';lines[1]=JSON.stringify(frame);await writeFile(path,lines.join('\n')+'\n');await assert.rejects(store.recall('paper-packaging'),/journal chain/);
}));
