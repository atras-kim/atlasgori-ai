import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('Inbox trash preserves message evidence, survives sync and restores', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table messages(id int primary key, owner_id int, project_id int, body text, unread boolean);
      create table attachments(id int primary key, message_id int references messages(id), content text);
      insert into messages values(1,10,20,'original',true);
      insert into attachments values(1,1,'original attachment');`);
    const migration = readFileSync(new URL('../supabase/migrations/012_inbox_trash.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const wrongOwner = await db.query('update messages set inbox_trashed_at=now() where id=1 and owner_id=11 returning id');
    assert.equal(wrongOwner.rows.length, 0);
    await db.exec('update messages set inbox_trashed_at=now() where id=1 and owner_id=10; update messages set unread=false where id=1;');
    assert.equal((await db.query('select * from messages where inbox_trashed_at is null')).rows.length, 0);
    assert.deepEqual((await db.query('select project_id,body from messages where id=1')).rows, [{project_id:20,body:'original'}]);
    assert.deepEqual((await db.query('select content from attachments')).rows, [{content:'original attachment'}]);
    await db.exec('update messages set inbox_trashed_at=null where id=1 and owner_id=10');
    assert.equal((await db.query('select * from messages where inbox_trashed_at is null')).rows.length, 1);
  } finally { await db.close(); }
});
