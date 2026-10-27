import test from 'node:test';
import assert from 'node:assert/strict';
import {POST} from '../app/api/sponsor-demo/route';
test('new live route is disabled by default; no upstream config or request needed',async()=>{
 delete process.env.ATLAS_SPONSOR_DEMO_ENABLED;
 const result=await POST(new Request('https://atlas.test/api/sponsor-demo',{method:'POST'}));
 assert.equal(result.status,404);assert.deepEqual(await result.json(),{error:'SPONSOR_DEMO_DISABLED'});
});
test('enabled route rejects foreign origins before authentication or any sponsor call',async()=>{
 process.env.ATLAS_SPONSOR_DEMO_ENABLED='1';process.env.ATLAS_APP_URL='https://atlas.test';
 try{const result=await POST(new Request('https://atlas.test/api/sponsor-demo',{method:'POST',headers:{Origin:'https://evil.test'}}));assert.equal(result.status,403);assert.deepEqual(await result.json(),{error:'SPONSOR_REQUEST_REJECTED'});}
 finally{delete process.env.ATLAS_SPONSOR_DEMO_ENABLED;delete process.env.ATLAS_APP_URL;}
});
