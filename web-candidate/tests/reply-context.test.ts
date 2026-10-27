import test from 'node:test';
import assert from 'node:assert/strict';
import { replyDraft } from '../lib/reply-policy';
test('reply retains exact source identity even when two messages share a subject',()=>{
  const a=replyDraft({id:'a',account_id:'account',sender:'Jina <jina@example.com>',subject:'Quotation'},'첫 초안');
  const b=replyDraft({id:'b',account_id:'account',sender:'Tiger <tiger@example.com>',subject:'Quotation'},'둘째 초안');
  const parked=new Map([[a.sourceMessageId,a],[b.sourceMessageId,b]]);
  assert.equal(parked.get('a')?.to,'jina@example.com');
  assert.equal(parked.get('b')?.body,'둘째 초안');
  assert.equal(parked.size,2);
});
