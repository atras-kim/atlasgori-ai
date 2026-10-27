import test from 'node:test';
import assert from 'node:assert/strict';
import { reviseDraft } from '../lib/draft-revision';
import { previewDraft } from '../lib/preview-drafts';
import type { Message } from '../lib/types';
const id = '11111111-1111-4111-8111-111111111111';
const input = {accountId:id,consent:true,body:'Thank you for the offer.',instruction:'Ask for delivery date.'};
test('rewrite rejects missing consent, excess size and foreign account before AI',async()=>{
  for(const value of [{...input,consent:false},{...input,body:' '},{...input,instruction:'x'.repeat(2001)},{...input,body:'x'.repeat(20001)}]) {
    await assert.rejects(reviseDraft(value,async()=>assert.fail('authorization reached'),async()=>assert.fail('AI reached')));
  }
  await assert.rejects(reviseDraft(input,async()=>{throw new Error('foreign');},async()=>assert.fail('AI reached')),/foreign/);
});
test('rewrite forwards only bounded body and instructions; envelope never goes to AI',async()=>{
  let authorized=false;
  const result=await reviseDraft({...input,to:'private@example.com',attachments:['secret'],subject:'private'},async account=>{
    assert.equal(account,id);authorized=true;
  },async(_task,data,schema)=>{
    assert.ok(authorized);assert.deepEqual(data,{draft:input.body,requestedChanges:input.instruction});assert.equal(schema.additionalProperties,false);
    return {body:'Please confirm the delivery date.'};
  });
  assert.equal(result.body,'Please confirm the delivery date.');
});
test('malformed rewrite is upstream error and has no send behavior',async()=>{
  await assert.rejects(reviseDraft(input,async()=>{},async()=>({body:null})),(error:unknown)=>{
    assert.equal((error as {status:number}).status,502);return true;
  });
});
test('preview drafts bind replies to source; analysis shares start without recipients or attachments',()=>{
  const message={id,account_id:'source-account',sender:'Supplier <supplier@example.com>',subject:'Re: quote'} as Message;
  const item={id,product:'oil',company:'supplier',project:'oil',summary:'Summary',risks:[],actions:[],reply:{body:'Reply',reason:'',checks:[]}};
  const reply=previewDraft(message,item,'reply','default-account');
  assert.equal(reply.to,'supplier@example.com');assert.equal(reply.accountId,'source-account');assert.equal(reply.subject,'Re: quote');assert.deepEqual(reply.attachments,[]);
  const share=previewDraft(message,item,'analysis','default-account');
  assert.equal(share.to,'');assert.equal(share.cc,'');assert.equal(share.bcc,'');assert.equal(share.accountId,'default-account');assert.match(share.body,/Summary/);
  assert.throws(()=>previewDraft({...message,id:'different'},item,'reply','default-account'));
});
