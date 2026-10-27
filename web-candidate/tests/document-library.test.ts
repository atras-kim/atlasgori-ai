import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test("document folders preserve originals and enforce live project access", async t => {
  const db = new PGlite();
  await db.exec(`create schema auth; create table auth.users(id uuid primary key,email text);
    create role anon; create role authenticated; create role service_role bypassrls;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to authenticated;`);
  for (const name of ["001_atlas.sql", "002_evidence_integrity.sql", "003_document_library.sql", "004_mail_assistance.sql", "007_project_organization.sql"]) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8").replace("create extension if not exists pgcrypto;", ""));
  }
  const owner = randomUUID(), peer = randomUUID(), outsider = randomUUID(), account = randomUUID(), p1 = randomUUID(), p2 = randomUUID(), message = randomUUID();
  for (const id of [owner, peer, outsider]) await db.query("insert into auth.users values($1,$2)", [id, `${id}@example.com`]);
  await db.query("insert into mail_accounts(id,owner_id,email,provider) values($1,$2,'me@example.com','gmail')", [account, owner]);
  await db.query("insert into projects(id,owner_id,name,visibility) values($1,$3,'One','Project Shared'),($2,$3,'Two','Private')", [p1,p2,owner]);
  await db.query("insert into project_members values($1,$2)",[p1,peer]);
  await db.query("insert into messages(id,account_id,owner_id,provider_id,subject,sender,received_at,project_id) values($1,$2,$3,'original','Quote and brochure','Acme <sales@acme.test>',now(),$4)",[message,account,owner,p1]);
  const content = Buffer.from("unchanged original file bytes").toString("base64");
  const ids: Record<string,string> = {};
  for (const name of ["Quotation_2026.pdf","Product_Brochure.pdf","quote_and_brochure.pdf","invoice.pdf"]) {
    ids[name] = randomUUID();
    await db.query("insert into attachments(id,message_id,name,size,type,content_base64) values($1,$2,$3,29,'application/pdf',$4)",[ids[name],message,name,content]);
  }
  async function asUser(id:string, sql:string, args:unknown[] = []) {
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
    try { return await db.query(sql,args); } finally { await db.exec("reset role"); }
  }
  await t.test("new attachments classify explicit names and leave ambiguous files for review",async()=>{
    const rows = (await db.query("select name,document_kind from attachments order by name")).rows;
    assert.deepEqual(rows,[{name:"Product_Brochure.pdf",document_kind:"brochure"},{name:"Quotation_2026.pdf",document_kind:"quote"},{name:"invoice.pdf",document_kind:"review"},{name:"quote_and_brochure.pdf",document_kind:"review"}]);
    assert.equal((await db.query<{company_label:string}>("select company_label from attachments where id=$1",[ids["Product_Brochure.pdf"]])).rows[0].company_label,"acme.test");
  });
  await t.test("public mailboxes are separate and missing or multiple senders require review",async()=>{
    const classify = async(sender:string) => (await db.query<{result:{kind:string;company_key:string}}>("select document_classification('brochure.pdf',$1) as result",[sender])).rows[0].result;
    assert.notEqual((await classify("a@gmail.com")).company_key,(await classify("b@gmail.com")).company_key);
    assert.notEqual((await classify("a@yahoo.co.uk")).company_key,(await classify("b@yahoo.co.uk")).company_key);
    assert.equal((await classify("Unknown Sender")).kind,"review");
    assert.equal((await classify("a@example.com, b@example.org")).kind,"review");
  });
  await t.test('contracts classify without confusing mixed or unrelated filenames',async()=>{
    for(const [name,kind] of [['Supply_Contract.pdf','contract'],['NDA.pdf','contract'],['공급계약서.pdf','contract'],['quote_contract.pdf','review'],['brochure_agreement.pdf','review'],['contractor_profile.pdf','review']]) {
      const result=await db.query<{v:{kind:string}}>("select document_classification($1,'sales@acme.test') as v",[name]);assert.equal(result.rows[0].v.kind,kind);
    }
  });
  await t.test("view and aggregate inherit RLS without leaking content or counts",async()=>{
    assert.equal((await asUser(peer,"select * from document_library")).rows.length,4);
    assert.equal((await asUser(outsider,"select * from document_library")).rows.length,0);
    assert.equal((await asUser(outsider,"select * from document_folders($1)",[p1])).rows.length,0);
    const row = (await asUser(owner,"select * from document_library limit 1")).rows[0] as object;
    assert.equal("content_base64" in row,false);
  });
  await t.test("project membership removal immediately revokes file and folder access",async()=>{
    await db.query("delete from project_members where project_id=$1",[p1]);
    assert.equal((await asUser(peer,"select * from document_library")).rows.length,0);
    assert.equal((await asUser(peer,"select * from document_folders($1)",[p1])).rows.length,0);
    assert.equal((await asUser(peer,"select content_base64 from attachments")).rows.length,0);
  });
  await t.test("only mail owner can correct classification through the server operation",async()=>{
    const id = ids["Product_Brochure.pdf"];
    assert.equal((await db.query<{correct_document:boolean}>("select correct_document($1,$2,'brochure','Acme Foods')",[peer,id])).rows[0].correct_document,false);
    await assert.rejects(()=>asUser(owner,"select correct_document($1,$2,'brochure','Acme Foods')",[owner,id]),/permission denied/);
    assert.equal((await db.query<{correct_document:boolean}>("select correct_document($1,$2,'brochure','Acme Foods')",[owner,id])).rows[0].correct_document,true);
  });
  await t.test("manual correction survives repeated backfill without altering bytes or file count",async()=>{
    await db.exec("update attachments set name=name where not document_manual; update attachments set name=name;");
    const rows = (await db.query<{content_base64:string;company_label:string;id:string}>("select id,content_base64,company_label from attachments")).rows;
    assert.equal(rows.length,4); assert.ok(rows.every(r=>r.content_base64===content));
    assert.equal(rows.find(r=>r.id===ids["Product_Brochure.pdf"])?.company_label,"Acme Foods");
  });
  await t.test("project reassignment moves folders atomically without copying originals",async()=>{
    await db.query("update messages set project_id=$1 where id=$2",[p2,message]);
    assert.equal((await asUser(owner,"select * from document_folders($1)",[p1])).rows.length,0);
    assert.equal((await asUser(owner,"select * from document_library where project_id=$1",[p2])).rows.length,4);
    await db.query("update messages set project_id=null where id=$1",[message]);
    assert.equal((await asUser(owner,"select * from document_library where project_id is null")).rows.length,4);
  });
  await t.test("deleting the source removes document references and empty folders",async()=>{
    await db.query("delete from messages where id=$1",[message]);
    assert.equal((await asUser(owner,"select * from document_library")).rows.length,0);
    assert.equal((await asUser(owner,"select * from document_folders(null)")).rows.length,0);
  });
  await t.test('explicit organization reuses private projects and never overwrites assignments',async()=>{
    const mid=randomUUID();await db.query("insert into messages(id,account_id,owner_id,provider_id,subject,sender,received_at) values($1,$2,$3,'new','Business','sales@acme.test',now())",[mid,account,owner]);
    const organize=(user:string,name:string)=>db.query<{r:{changed:boolean;projectId:string}}>("select organize_saved_message($1,$2,$3,'oil','Acme','Business','sales@acme.test') as r",[user,mid,name]);
    await assert.rejects(organize(outsider,'New'),/unavailable/);
    const result=(await organize(owner,' two ')).rows[0].r;assert.equal(result.changed,true);assert.equal(result.projectId,p2);
    const retry=(await organize(owner,'Different')).rows[0].r;assert.equal(retry.changed,false);assert.equal(retry.projectId,p2);
    assert.equal((await db.query("select id from projects where name='Different'")).rows.length,0);
    await assert.rejects(()=>asUser(owner,"select organize_saved_message($1,$2,'Private','oil','Acme','Business','sales@acme.test')",[owner,mid]),/permission/i);
  });
  await db.close();
});
