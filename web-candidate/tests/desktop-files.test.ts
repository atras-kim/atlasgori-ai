import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,symlink,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {safeName,attachmentFolder,exportFilename,writeOnce,companyFolder} from '../lib/desktop-files';
test('companies with identical sanitized labels remain separate',()=>{
 assert.notEqual(companyFolder('A/B','one.com'),companyFolder('A:B','two.com'));
 assert.notEqual(companyFolder('a'.repeat(40),'one.com'),companyFolder('a'.repeat(40),'two.com'));
 assert.equal(companyFolder('Same','one.com'),companyFolder('Same','one.com'));
});
test('Windows paths, reserved names and active file extensions are neutralized',()=>{
 for(const input of ['../CON','a:b.exe','../../evil','trailing. ','NUL.txt','COM1','LPT².zip','a\\b']){
 const name=safeName(input);assert.ok(!/[\\/:]/.test(name));assert.ok(!/[. ]$/.test(name));assert.ok(!/^(nul|com1|lpt²)(\.|$)/i.test(name));}
 assert.match(exportFilename('evil.html','id',Buffer.from('a')),/\.download$/);
 assert.match(exportFilename('photo.jpg','id',Buffer.from('a')),/\.jpg$/);
});
test('document folders separate purchase orders and images; manual classification wins',()=>{
 const kind=(name:string,type='application/pdf',extra={})=>attachmentFolder({name,type,...extra});
 assert.equal(kind('purchase_order.pdf'),'발주서');assert.equal(kind('발주서.pdf'),'발주서');
 assert.equal(kind('quote.pdf'),'견적서');assert.equal(kind('catalog.pdf'),'브로셔');
 assert.equal(kind('photo.jpg','image/jpeg'),'이미지');assert.equal(kind('quote_contract.pdf'),'검토 필요');
 assert.equal(kind('photo.jpg','image/jpeg',{document_manual:true,document_kind:'review'}),'검토 필요');
});
test('exports preserve exact bytes, skip duplicates and never overwrite changed files',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'atlas-export-'));
 try{
 const bytes=Buffer.from([0,255,12,100]),parts=['프로젝트','이미지'],name=exportFilename('x.png','id',bytes);
 assert.equal(await writeOnce(root,parts,name,bytes),'saved');assert.deepEqual(await readFile(path.join(root,...parts,name)),bytes);
 assert.equal(await writeOnce(root,parts,name,bytes),'skipped');await writeFile(path.join(root,...parts,name),'user');
 assert.equal(await writeOnce(root,parts,name,bytes),'conflict');assert.equal(await readFile(path.join(root,...parts,name),'utf8'),'user');
 await assert.rejects(writeOnce(root,['..'],'escape.txt',bytes));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('junction or symlink parents cannot redirect export',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'atlas-export-')),outside=await mkdtemp(path.join(os.tmpdir(),'atlas-outside-'));
 try{await symlink(outside,path.join(root,'redirect'),'junction');await assert.rejects(writeOnce(root,['redirect'],'x.txt',Buffer.from('no')));}
 finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
