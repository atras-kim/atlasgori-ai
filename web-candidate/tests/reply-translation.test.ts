import test from 'node:test';
import assert from 'node:assert/strict';
import { translateReply } from '../lib/reply-translation';
test('detect source separately then translate edited draft with explicit language', async()=>{
 let calls=0;
 const result=await translateReply('금액 USD 100 확인 부탁드립니다.',{subject:'Quote',body:'Dear Jamie, please confirm.'},async(task,data)=>{
  calls++;
  if(calls===1){assert.equal((data as any).approvedDraft,undefined);assert.equal((data as any).body,'Dear Jamie, please confirm.');return {code:'en',name:'영어'};}
  assert.match(task,/language code en/);assert.equal((data as any).approvedDraft,'금액 USD 100 확인 부탁드립니다.');return {body:'Please confirm USD 100.',language:'영어'};
 });
 assert.equal(calls,2);assert.equal(result.body,'Please confirm USD 100.');
});
test('unknown language stops before translation',async()=>{
 let calls=0;
 await assert.rejects(translateReply('초안',{subject:'',body:''},async()=>{calls++;return {code:'unknown',name:'알 수 없음'};}),/언어/);
 assert.equal(calls,1);
});
test('rejects untranslated Korean prose for an English target',async()=>{
 let calls=0;
 await assert.rejects(translateReply('견적을 보내주셔서 감사합니다. 확인 부탁드립니다.',{subject:'Quote',body:'Hello'},async()=>++calls===1?{code:'en',name:'영어'}:{body:'견적을 보내주셔서 감사합니다. 확인 부탁드립니다.',language:'영어'}),/한국어/);
});
