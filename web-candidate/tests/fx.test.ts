import test from 'node:test';
import assert from 'node:assert/strict';
import {krwRates,rateChange,FX_REFRESH_MS} from '../lib/fx';
test('Direct quotes preserve precision per foreign unit including JPY',()=>{
  const result=krwRates([{base:'USD',quote:'KRW',rate:1400,date:'2026-10-04'},{base:'JPY',quote:'KRW',rate:9.5,date:'2026-10-03'},{base:'EUR',quote:'KRW',rate:1600,date:'2026-10-04'}]);
  assert.equal(result.rates.USD,1400);assert.equal(result.rates.JPY,9.5);assert.equal(result.rates.EUR,1600);assert.equal(result.dates.JPY,'2026-10-03');
});
test('invalid quotes cannot produce infinite, negative or fake rates',()=>{
  assert.throws(()=>krwRates([{base:'USD',quote:'KRW',rate:0,date:'2026-10-04'}]));
  const result=krwRates([{base:'USD',quote:'KRW',rate:1000,date:'2026-10-04'},{base:'JPY',quote:'KRW',rate:-2,date:'2026-10-04'},{base:'CNY',quote:'KRW',rate:Infinity,date:'2026-10-04'}]);
  assert.deepEqual(result.rates,{USD:1000});
});
test('first observation has no invented change and polling is hourly',()=>{
  assert.equal(rateChange(1400),null);assert.deepEqual(rateChange(1400,1400),{won:0,percent:0});assert.equal(rateChange(1410,1400)?.won,10);assert.equal(FX_REFRESH_MS,3600000);
});
