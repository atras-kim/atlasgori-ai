import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {seal,unseal} from '../lib/security';
import {savedDraftSchema,saveRequest} from '../lib/saved-work';
test('partial drafts allow missing recipient/title but never retain approval state',()=>{
 const draft=savedDraftSchema.parse({accountId:'11111111-1111-4111-8111-111111111111',to:'',cc:'',bcc:'',subject:'',body:'work in progress',attachments:[],approved:true,intentId:'old',savedId:'old'});
 assert.equal(draft.to,'');assert.equal('approved' in draft,false);assert.equal('intentId' in draft,false);assert.equal('savedId' in draft,false);
 assert.equal(saveRequest.safeParse({kind:'draft',id:'11111111-1111-4111-8111-111111111111',value:draft}).success,false);
});
test('saved ciphertext binds owner, record and kind',()=>{
 const key=process.env.ATLAS_ENCRYPTION_KEY;process.env.ATLAS_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');
 try{const value=seal({body:'private'},'saved-work:a:1:draft');assert.deepEqual(unseal(value,'saved-work:a:1:draft'),{body:'private'});
 for(const other of ['saved-work:b:1:draft','saved-work:a:2:draft','saved-work:a:1:analysis'])assert.throws(()=>unseal(value,other));
 }finally{if(key===undefined)delete process.env.ATLAS_ENCRYPTION_KEY;else process.env.ATLAS_ENCRYPTION_KEY=key;}
});
test('saved work RLS and atomic version guards isolate owners and stale edits',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated,anon,service_role;`);
 await db.exec(readFileSync(new URL('../supabase/migrations/006_saved_work.sql',import.meta.url),'utf8'));
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 await db.query('insert into auth.users values($1),($2)',[a,b]);
 await db.query("insert into saved_work(id,owner_id,kind,ciphertext,title_ciphertext) values($1,$1,'draft','encrypted-a','title-a'),($2,$2,'analysis','encrypted-b','title-b')",[a,b]);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${a}';`);
 assert.equal((await db.query('select * from saved_work')).rows.length,1);
 await assert.rejects(db.exec("update saved_work set ciphertext='changed'"),/permission/i);
 await assert.rejects(db.exec('delete from saved_work'),/permission/i);
 await db.exec('reset role;set role anon;');await assert.rejects(db.exec('select * from saved_work'),/permission/i);
 await db.exec('reset role;');
 assert.equal((await db.query('update saved_work set version=2 where id=$1 and owner_id=$2 and version=1 returning id',[a,b])).rows.length,0);
 assert.equal((await db.query('update saved_work set version=2 where id=$1 and owner_id=$1 and version=1 returning id',[a])).rows.length,1);
 assert.equal((await db.query('update saved_work set version=2 where id=$1 and owner_id=$1 and version=1 returning id',[a])).rows.length,0);
 }finally{await db.close();}
});
