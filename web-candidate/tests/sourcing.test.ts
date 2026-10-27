import test from 'node:test';
import assert from 'node:assert/strict';
import { citedCandidates, sourcingBudget } from '../lib/sourcing-openai';
test('sourcing fits starter quota and rejects excessive input before reservation',()=>{
 assert.ok(sourcingBudget('대두유 공급업체 20곳').reserve<100000);
 assert.ok(sourcingBudget('가'.repeat(2666)).reserve<100000);
 assert.throws(()=>sourcingBudget('가'.repeat(2667)));
 assert.throws(()=>sourcingBudget(' '));
 assert.equal(sourcingBudget('a').output,4500);
});
test('only real citation annotations become candidates, unsafe URLs and duplicate domains are excluded',()=>{
 const results=citedCandidates({output:[{type:'message',content:[{type:'output_text',text:'Invented https://fake.test',annotations:[
 {type:'url_citation',url:'https://www.supplier.test/product',title:'Supplier'},
 {type:'url_citation',url:'https://supplier.test/other',title:'Duplicate'},
 {type:'url_citation',url:'javascript:alert(1)',title:'Bad'},
 {type:'url_citation',url:'https://user:secret@other.test',title:'Bad'},
 {type:'other',url:'https://not-cited.test'},
 ]}]}]});
 assert.equal(results.length,1);assert.equal(results[0].name,'Supplier');
 assert.equal(citedCandidates({output:[]}).length,0);
 assert.equal(citedCandidates({output:[{type:'message',content:[{type:'output_text',annotations:[{type:'url_citation',url:'https://a.test'},{type:'url_citation',url:'https://b.test'}]}]}]},1).length,1);
});
