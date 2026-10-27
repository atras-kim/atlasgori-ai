import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { replyDraft, replyRecipient, replySchema } from "../lib/reply-policy";

test("reply envelope comes only from the original sender and account", () => {
  const parsed = replySchema.parse({ body: "Thanks", reason: "Confirm details", checks: [], to: "attacker@example.com" });
  assert.deepEqual(replyDraft({ account_id: "owner-account", sender: "Supplier <sales@example.com>", subject: "Quote" }, parsed.body),
    { accountId: "owner-account", to: "sales@example.com", cc: "", bcc: "", subject: "Re: Quote", body: "Thanks", attachments: [] });
  for (const s of ["a@example.com,b@example.com", "a@example.com\r\nBcc: b@example.com", "not-an-email"]) assert.throws(()=>replyRecipient(s));
});

test("automatic mail assistance is private, consent-bound and idempotent", async t => {
  const db = new PGlite();
  await db.exec(`create schema auth; create table auth.users(id uuid primary key,email text);
    create role anon; create role authenticated; create role service_role bypassrls;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to authenticated;`);
  for (const name of ["001_atlas.sql", "002_evidence_integrity.sql", "003_document_library.sql", "004_mail_assistance.sql"])
    await db.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8").replace("create extension if not exists pgcrypto;", ""));
  const owner=randomUUID(), peer=randomUUID(), account=randomUUID();
  for(const id of [owner,peer]) await db.query("insert into auth.users values($1,$2)",[id,`${id}@example.com`]);
  await db.query("insert into mail_accounts(id,owner_id,email,provider,ai_enabled,automation_enabled) values($1,$2,'owner@example.com','gmail',true,true)",[account,owner]);
  const reply={body:"Thank you. Please confirm validity.",reason:"Missing terms",checks:["Check recipient"]};
  async function message() { const id=randomUUID(); await db.query("insert into messages(id,account_id,owner_id,provider_id,subject,sender,body,received_at) values($1::uuid,$2,$3,$1::text,'Quote','sales@example.com','Source',now())",[id,account,owner]); return id; }
  async function save(id:string,name:string|null="Soybean Oil",project:string|null=null,user=owner,source="Source", version?:number) {
    const v=version ?? (await db.query<{assistance_version:number}>("select assistance_version from messages where id=$1",[id])).rows[0].assistance_version;
    return (await db.query<{ok:boolean}>("select save_mail_assistance($1,$2,$3,$4,'Soybean Oil','Acme',$5,'Quote',$6,'sales@example.com',true,$7) as ok",[user,id,project,name,JSON.stringify(reply),source,v])).rows[0].ok;
  }
  async function asUser(id:string,sql:string) {
    await db.exec("set role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
    try { return await db.query(sql); } finally { await db.exec("reset role"); }
  }
  const first=await message(); let projectId:string;
  await t.test("creates one private project and routes attachments without copying",async()=>{
    await db.query("insert into attachments(message_id,name,size,type,content_base64) values($1,'Quotation.pdf',3,'application/pdf','YWJj')",[first]);
    assert.equal(await save(first),true); assert.equal(await save(first),true);
    const projects=(await db.query<{id:string;visibility:string;owner_id:string}>("select * from projects")).rows;
    assert.equal(projects.length,1); assert.equal(projects[0].visibility,"Private"); assert.equal(projects[0].owner_id,owner); projectId=projects[0].id;
    assert.equal((await db.query<{project_id:string}>("select project_id from document_library")).rows[0].project_id,projectId);
    const second=await message(); await save(second,"  SOYBEAN   OIL  ");
    assert.equal((await db.query("select id from projects")).rows.length,1);
    assert.equal((await db.query("select * from mail_assistance")).rows.length,2);
  });
  await t.test("preserves manual assignment and never joins a shared project automatically",async()=>{
    await db.query("update projects set visibility='Project Shared' where id=$1",[projectId]);
    await db.query("insert into project_members values($1,$2)",[projectId,peer]);
    await save(first,"Unwanted new project");
    assert.equal((await db.query("select id from projects")).rows.length,1);
    const id=await message(); await save(id,null,projectId);
    assert.equal((await db.query<{project_id:string|null}>("select project_id from messages where id=$1",[id])).rows[0].project_id,null);
  });
  await t.test("shared readers cannot see suggestions or execute mutations",async()=>{
    assert.ok((await asUser(peer,"select * from messages")).rows.length>0);
    assert.equal((await asUser(peer,"select * from mail_assistance")).rows.length,0);
    assert.ok((await asUser(owner,"select * from mail_assistance")).rows.length>0);
    await assert.rejects(()=>asUser(owner,`select save_mail_assistance('${owner}','${first}',null,null,'','',null,'','','',true,0)`),/permission denied/);
    assert.equal(await save(first,"Other",null,peer),false);
  });
  await t.test("revoked consent and stale sources reject late results",async()=>{
    const id=await message();
    await db.exec("update mail_accounts set automation_enabled=false"); assert.equal(await save(id),false);
    await db.exec("update mail_accounts set automation_enabled=true,ai_enabled=false"); assert.equal(await save(id),false);
    await db.exec("update mail_accounts set ai_enabled=true"); assert.equal(await save(id,"New",null,owner,"Old source"),false);
    await db.query("update messages set body='Changed' where id=$1",[first]);
    assert.equal((await db.query("select * from mail_assistance where message_id=$1",[first])).rows.length,0);
  });
  await t.test("attachment edits invalidate stored and in-flight suggestions",async()=>{
    const id=await message(); await save(id);
    await db.query("insert into attachments(message_id,name,size,type,content_base64) values($1,'Quote.pdf',3,'application/pdf','YWJj')",[id]);
    assert.equal((await db.query("select * from mail_assistance where message_id=$1",[id])).rows.length,0);
    assert.equal(await save(id,"Soybean Oil",null,owner,"Source",0),false);
  });
  await t.test("automatic creation is capped and unclear classification remains unassigned",async()=>{
    for(let i=0;i<25;i++) await save(await message(),`Product ${i}`);
    assert.equal((await db.query("select id from projects where auto_created_at is not null")).rows.length,20);
    const id=await message(); await save(id,null);
    assert.equal((await db.query<{project_id:string|null}>("select project_id from messages where id=$1",[id])).rows[0].project_id,null);
  });
  await db.close();
});
