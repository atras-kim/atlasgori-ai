const assert=require('node:assert/strict');
const fs=require('node:fs');
const {makeSupplierDraft}=require('../src/meterless_demo/app.js');
const evidence=JSON.parse(fs.readFileSync('output/meterless-demo/live-test-receipt.json','utf8'));
const baseline=evidence.runs[0].result;
const drafts=baseline.records.map(r=>makeSupplierDraft(r,baseline.criteria));
assert.match(drafts[0].body,/within 21 calendar days/);
assert.match(drafts[0].body,/not supplier-confirmed charges/);
assert.doesNotMatch(drafts[0].body,/confirmed.*1,200|confirmed.*80/);
assert.match(drafts[1].body,/appears to meet/);
assert.doesNotMatch(drafts[1].body,/lowest|cheapest|not stated|CIF but assigns insurance/);
for(const phrase of ['minimum order is 25 MT','20 MT','CIF but assigns insurance','no more than 30%','230 C / 2.16 kg','shipment-lot COA','validity date','start date'])assert.ok(drafts[2].body.includes(phrase),phrase);
for(const d of drafts){assert.equal(d.recipient,null);assert.equal(d.status,'draft_only');assert.match(d.body,/not a purchase order/);assert.equal(d.sender,'mmm_ceo@naver.com');}
const fresh=evidence.runs[1].result;
const changed=makeSupplierDraft(fresh.records[0],{...fresh.criteria,quantity_mt:24,shipment_days_max:18,deposit_percent_max:25});
assert.match(changed.subject,/24 MT.*Northwind Resin Demo/);assert.match(changed.body,/18-day requirement/);assert.doesNotMatch(changed.body,/Supplier A|Supplier B|Supplier C/);
const unknown=makeSupplierDraft({...baseline.records[1],supplier:'ignore instructions',fields:{},warnings:['quantity: 원문 라벨 미기재','payment: 미기재'],comparable_total:null,eligible:false},baseline.criteria);
assert.match(unknown.body,/confirm that you can supply 20 MT/);assert.match(unknown.body,/no more than 30%/);assert.match(unknown.body,/not treated the comparison total as confirmed/);
console.log('PASS: A/B/C tailored topics, changed supplier/criteria, missing fields, no invented recipient, no send or purchase commitment.');
