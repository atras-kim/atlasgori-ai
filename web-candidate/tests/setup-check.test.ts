import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error standalone Node setup utility
import { inspectSetup, initializeFile } from '../scripts/setup-check.mjs';
test('setup checks reject server keys in public fields and unsafe origins without exposing secrets',()=>{
  const secret='sb_secret_this_is_a_fixture_not_a_real_key';
  const values={NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:secret,SUPABASE_SERVICE_ROLE_KEY:secret,ATLAS_APP_URL:'http://external.example.com',ATLAS_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')};
  const rows=inspectSetup(values);
  assert.equal(rows.find((r:{name:string})=>r.name==='NEXT_PUBLIC_SUPABASE_ANON_KEY').status,'invalid');
  assert.equal(rows.find((r:{name:string})=>r.name==='ATLAS_APP_URL').status,'invalid');
  assert.ok(!JSON.stringify(rows).includes(secret));
  values.NEXT_PUBLIC_SUPABASE_ANON_KEY='sb_publishable_this_is_a_fixture_key'; values.ATLAS_APP_URL='http://127.0.0.1:4317';
  assert.ok(inspectSetup(values).filter((r:{optional:boolean})=>!r.optional).every((r:{status:string})=>r.status==='configured'));
});
test('setup initialization never overwrites an existing encryption key',()=>{
  const dir=mkdtempSync(join(tmpdir(),'atlas-setup-')); const path=join(dir,'.env.local');
  try {
    assert.equal(initializeFile(path,'ATLAS_ENCRYPTION_KEY=\n',()=> 'original'),true);
    assert.equal(initializeFile(path,'ATLAS_ENCRYPTION_KEY=\n',()=> 'replacement'),false);
    assert.equal(readFileSync(path,'utf8'),'ATLAS_ENCRYPTION_KEY=original\n');
  } finally { rmSync(path); rmdirSync(dir); }
});
