import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
test("PostgreSQL RLS, evidence integrity and single-use state", async (t) => {
  const db = new PGlite();
  await db.exec(`create schema auth; create table auth.users(id uuid primary key,email text);
 create role anon; create role authenticated; create role service_role bypassrls;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to authenticated;`);
  for (const name of ["001_atlas.sql", "002_evidence_integrity.sql"]) {
    let sql = readFileSync(
      new URL(`../supabase/migrations/${name}`, import.meta.url),
      "utf8",
    );
    sql = sql.replace("create extension if not exists pgcrypto;", "");
    await db.exec(sql);
  }
  const owner = randomUUID(),
    peer = randomUUID(),
    outsider = randomUUID(),
    restricted = randomUUID(),
    org = randomUUID(),
    org2 = randomUUID(),
    account = randomUUID();
  for (const [id, email] of [
    [owner, "owner@example.com"],
    [peer, "peer@example.com"],
    [outsider, "outsider@example.com"],
    [restricted, "restricted@example.com"],
  ])
    await db.query("insert into auth.users values($1,$2)", [id, email]);
  await db.query("insert into companies values($1,$2),($3,$4)", [
    org,
    "A",
    org2,
    "B",
  ]);
  await db.query(
    "insert into company_members values($1,$2,'admin'),($1,$3,'member'),($4,$5,'admin')",
    [org, owner, peer, org2, outsider],
  );
  await db.query(
    "insert into mail_accounts(id,owner_id,email,provider) values($1,$2,'owner@example.com','gmail')",
    [account, owner],
  );
  await db.query("insert into account_secrets values($1,'cipher')", [account]);
  const projects: Record<string, string> = {};
  const messages: Record<string, string> = {};
  for (const visibility of [
    "Private",
    "Project Shared",
    "Company",
    "Restricted",
  ]) {
    const p = randomUUID(),
      m = randomUUID();
    projects[visibility] = p;
    messages[visibility] = m;
    await db.query(
      "insert into projects(id,owner_id,name,visibility,company_id) values($1,$2,$3,$3,$4)",
      [p, owner, visibility, org],
    );
    await db.query(
      "insert into messages(id,account_id,owner_id,provider_id,subject,sender,received_at,project_id) values($1::uuid,$2,$3,$1::text,'confidential','supplier',now(),$4)",
      [m, account, owner, p],
    );
    await db.query(
      "insert into attachments(message_id,name,size,type,content_base64) values($1,'quote.txt',1,'text/plain','YQ==')",
      [m],
    );
  }
  await db.query("insert into project_members values($1,$2),($3,$4)", [
    projects["Project Shared"],
    peer,
    projects.Restricted,
    restricted,
  ]);
  async function asUser(id: string, sql: string, args: unknown[] = []) {
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    try {
      return await db.query(sql, args);
    } finally {
      await db.exec("reset role");
    }
  }
  await t.test("owner sees all four projects", async () =>
    assert.equal(
      (await asUser(owner, "select * from projects")).rows.length,
      4,
    ),
  );
  await t.test(
    "same-company member sees Company and explicitly Shared only",
    async () => {
      const rows = (
        await asUser(peer, "select name from projects order by name")
      ).rows;
      assert.deepEqual(rows, [{ name: "Company" }, { name: "Project Shared" }]);
      assert.equal(
        (await asUser(peer, "select * from attachments")).rows.length,
        2,
      );
      assert.equal(
        (await asUser(peer, "select * from mail_accounts")).rows.length,
        0,
      );
    },
  );
  await t.test("unrelated company admin sees no mail or project", async () => {
    assert.equal(
      (await asUser(outsider, "select * from projects")).rows.length,
      0,
    );
    assert.equal(
      (await asUser(outsider, "select * from messages")).rows.length,
      0,
    );
    assert.equal(
      (await asUser(outsider, "select * from attachments")).rows.length,
      0,
    );
  });
  await t.test(
    "Restricted requires explicit membership, not company admin status",
    async () => {
      assert.deepEqual(
        (await asUser(restricted, "select name from projects")).rows,
        [{ name: "Restricted" }],
      );
    },
  );
  await t.test(
    "membership removal immediately revokes messages and attachments",
    async () => {
      await db.query("delete from project_members where user_id=$1", [
        restricted,
      ]);
      assert.equal(
        (await asUser(restricted, "select * from messages")).rows.length,
        0,
      );
      assert.equal(
        (await asUser(restricted, "select * from attachments")).rows.length,
        0,
      );
    },
  );
  await t.test(
    "authenticated users cannot directly mutate data or read secrets",
    async () => {
      await assert.rejects(
        asUser(owner, "update projects set visibility='Company'"),
      );
      await assert.rejects(asUser(owner, "select * from account_secrets"));
      await assert.rejects(asUser(owner, "select * from send_intents"));
      await assert.rejects(asUser(owner, "select * from oauth_states"));
    },
  );
  await t.test(
    "AI classification cannot assign into a project switched to shared",
    async () => {
      const m = randomUUID();
      await db.query(
        "insert into messages(id,account_id,owner_id,provider_id,subject,sender,received_at) values($1::uuid,$2,$3,$1::text,'private incoming','supplier',now())",
        [m, account, owner],
      );
      await db.query("update projects set visibility='Company' where id=$1", [
        projects.Private,
      ]);
      await db.query("select assign_private_classification($1,$2,$3,$4,$5)", [
        owner,
        m,
        projects.Private,
        "oil",
        "supplier",
      ]);
      assert.equal(
        (
          await db.query<{ project_id: string | null }>(
            "select project_id from messages where id=$1",
            [m],
          )
        ).rows[0].project_id,
        null,
      );
    },
  );
  await t.test(
    "removing evidence prevents a stale in-flight Brief from being saved",
    async () => {
      const p = projects.Company;
      const before = (
        await db.query<{ evidence_version: number }>(
          "select evidence_version from projects where id=$1",
          [p],
        )
      ).rows[0].evidence_version;
      await db.query("update messages set project_id=null where id=$1", [
        messages.Company,
      ]);
      const save = await db.query(
        "update projects set brief='{}' where id=$1 and evidence_version=$2 returning id",
        [p, before],
      );
      assert.equal(save.rows.length, 0);
    },
  );
  await t.test(
    "only one competing send claim wins and expired intent cannot win",
    async () => {
      const id = randomUUID();
      await db.query(
        "insert into send_intents(id,owner_id,account_id,ciphertext,digest,expires_at) values($1,$2,$3,'payload','digest',now()+interval '10 minutes')",
        [id, owner, account],
      );
      const claims = await Promise.all(
        [1, 2].map(() =>
          db.query(
            "update send_intents set status='sending' where id=$1 and status='prepared' and expires_at>now() returning id",
            [id],
          ),
        ),
      );
      assert.equal(
        claims.reduce((n, r) => n + r.rows.length, 0),
        1,
      );
      await db.query(
        "update send_intents set status='prepared',expires_at=now()-interval '1 second' where id=$1",
        [id],
      );
      assert.equal(
        (
          await db.query(
            "update send_intents set status='sending' where id=$1 and status='prepared' and expires_at>now() returning id",
            [id],
          )
        ).rows.length,
        0,
      );
    },
  );
  await t.test("OAuth state has a single atomic consumer", async () => {
    await db.query(
      "insert into oauth_states values('state-fixture',$1,now()+interval '10 minutes',false)",
      [owner],
    );
    const claims = await Promise.all(
      [1, 2].map(() =>
        db.query(
          "update oauth_states set consumed=true where id='state-fixture' and not consumed and expires_at>now() returning id",
        ),
      ),
    );
    assert.equal(
      claims.reduce((n, r) => n + r.rows.length, 0),
      1,
    );
  });
  await t.test(
    "server rate limit rejects repeated expensive actions",
    async () => {
      const results = [];
      for (let i = 0; i < 3; i++)
        results.push(
          (
            await db.query<{ take_rate_slot: boolean }>(
              "select take_rate_slot($1,$2,$3)",
              [owner, "ai-test", 2],
            )
          ).rows[0].take_rate_slot,
        );
      assert.deepEqual(results, [true, true, false]);
    },
  );
  await db.close();
});
