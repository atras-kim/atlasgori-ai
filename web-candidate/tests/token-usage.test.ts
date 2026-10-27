import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {reportedTokens} from '../lib/token-usage';
import {openaiJson} from '../lib/openai';
test('reported totals include cached input only once; missing is not zero',()=>{
 assert.deepEqual(reportedTokens({input_tokens:100,output_tokens:20,total_tokens:120,input_tokens_details:{cached_tokens:80}}),{input_tokens:100,output_tokens:20,total_tokens:120,cached_tokens:80});
 for(const raw of [null,{}, {input_tokens:100,output_tokens:20,total_tokens:200},{input_tokens:-1,output_tokens:1,total_tokens:0}])assert.equal(reportedTokens(raw),null);
});
test('usage is recorded before incomplete or invalid JSON is rejected',async()=>{
 const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test';
 try {for(const status of ['incomplete','completed']){
  let reports=0;globalThis.fetch=async()=>Response.json({id:'response-test',status,usage:{input_tokens:10,output_tokens:5,total_tokens:15},output:[{type:'message',content:[{type:'output_text',text:'invalid json'}]}]});
  await assert.rejects(openaiJson('test',{},async r=>{reports++;assert.equal(reportedTokens(r.usage)?.total_tokens,15);}));assert.equal(reports,1);
 }}finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
test('usage isolation, permissions, month boundary and unconfirmed totals',async()=>{
 const db=new PGlite();
 await db.exec(`create schema auth; create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated;`);
 await db.exec(readFileSync(new URL('../supabase/migrations/005_ai_usage.sql',import.meta.url),'utf8'));
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 await db.query('insert into auth.users values($1),($2)',[a,b]);
 await db.exec(`insert into ai_usage_events(owner_id,feature,model,status,input_tokens,output_tokens,cached_tokens,total_tokens,created_at) values
 ('${a}','preview','test','reported',100,20,80,120,date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'),
 ('${a}','preview','test','reported',999,0,0,999,(date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')-interval '1 microsecond'),
 ('${b}','preview','test','reported',800,0,0,800,now()),
 ('${a}','brief','test','reported',7,0,0,7,((date_trunc('month',now() at time zone 'Asia/Seoul')+interval '1 month') at time zone 'Asia/Seoul')-interval '1 microsecond'),
 ('${a}','brief','test','reported',900,0,0,900,(date_trunc('month',now() at time zone 'Asia/Seoul')+interval '1 month') at time zone 'Asia/Seoul');
 insert into ai_usage_events(owner_id,feature,model) values('${a}','reply','test');`);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${a}';`);
 const result=await db.query<{v:{total:number;cached:number;requests:number;unconfirmed:number}}>('select my_ai_usage() as v');
 assert.equal(result.rows[0].v.total,127);assert.equal(result.rows[0].v.cached,80);assert.equal(result.rows[0].v.requests,3);assert.equal(result.rows[0].v.unconfirmed,1);
 assert.equal((await db.query('select * from ai_usage_events')).rows.length,5);
 await assert.rejects(db.exec("update ai_usage_events set total_tokens=0"),/permission/i);
 await assert.rejects(db.exec("delete from ai_usage_events"),/permission/i);
 await assert.rejects(db.exec(`insert into ai_usage_events(owner_id,feature,model)values('${a}','preview','x')`),/permission/i);
 await db.exec('reset role;set role anon;');await assert.rejects(db.exec('select my_ai_usage()'),/permission/i);
 await db.close();
});
