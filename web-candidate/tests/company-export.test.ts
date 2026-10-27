import {test} from 'node:test';
import assert from 'node:assert/strict';
import {messageCompanyFolder} from '../lib/desktop-files';
test('same identified company groups senders; different companies stay distinct',()=>{
 assert.equal(messageCompanyFolder('Acme','a@example.com'),messageCompanyFolder('Acme','b@example.com'));
 assert.notEqual(messageCompanyFolder('Acme','a@example.com'),messageCompanyFolder('Beta','a@example.com'));
});
test('unknown companies retain distinct sender folders and normalize display names',()=>{
 assert.equal(messageCompanyFolder(null,'Kim <A@example.com>'),messageCompanyFolder('','a@example.com'));
 assert.notEqual(messageCompanyFolder(null,'a@example.com'),messageCompanyFolder(null,'b@example.com'));
 assert.doesNotMatch(messageCompanyFolder('../unsafe/name','a@example.com'),/[\\/]/);
});
