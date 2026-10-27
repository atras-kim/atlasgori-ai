import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {parseQuoteFile} from '../lib/quote-parser';
import {quoteResultSchema,validEvidence,quoteWon} from '../lib/quote-schema';
test('XLSX worker preserves cell evidence and cached formulas without evaluation',async()=>{
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('견적');sheet.addRow(['Product','USD/unit','MOQ']);sheet.addRow(['Soybean Oil',12.5,'1000 kg']);sheet.getCell('B3').value={formula:'B2*2',result:25};sheet.getCell('B4').value={formula:'B2*3'};
 const value=await parseQuoteFile('quote.xlsx',Buffer.from(await book.xlsx.writeBuffer()));
 assert.ok(value.sources.some(s=>s.id==='견적!행 2'&&s.text.includes('B2=12.5')));
 assert.ok(value.sources.some(s=>s.text.includes('B3=25')));assert.ok(value.sources.some(s=>s.text.includes('수식 결과 없음')));assert.ok(value.warnings.length);
});
test('PDF worker returns page evidence; malformed and unsupported inputs fail',async()=>{
 const stream='BT /F1 12 Tf 72 720 Td (Quote USD 12.50 per kg) Tj ET';
 const parts=['%PDF-1.4\n'];const offsets=[0];
 const objs=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 objs.forEach((obj,i)=>{offsets.push(Buffer.byteLength(parts.join('')));parts.push(`${i+1} 0 obj\n${obj}\nendobj\n`);});const xref=Buffer.byteLength(parts.join(''));parts.push(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${xref}\n%%EOF`);
 const result=await parseQuoteFile('quote.pdf',Buffer.from(parts.join('')));assert.equal(result.sources[0].id,'PDF p.1');assert.match(result.sources[0].text,/USD 12.50/);
 await assert.rejects(parseQuoteFile('bad.pdf',Buffer.from('not a pdf')));
 await assert.rejects(parseQuoteFile('old.xls',Buffer.from('x')));
 await assert.rejects(parseQuoteFile('large.pdf',Buffer.alloc(5*1024*1024+1)));
});
test('evidence must exist and numeric unknowns never become zero',()=>{
 const line={supplier:'A',product:'Oil',specification:'',unitPrice:12.5,priceRaw:'USD 12.50',currency:'USD',unit:'kg',quantity:'',moq:'',leadTime:'',incoterm:'',charges:'',validUntil:'',evidenceIds:['p1'],excerpt:'USD 12.50'};
 const r=quoteResultSchema.parse({items:[line],warnings:[]});assert.ok(validEvidence(r,[{id:'p1',text:'Quote USD 12.50 per kg'}]));assert.equal(validEvidence(r,[{id:'p2',text:'USD 12.50'}]),false);
 assert.equal(quoteWon(line,{USD:1400}),17500);assert.equal(quoteWon({...line,unitPrice:null},{USD:1400}),null);assert.equal(quoteWon({...line,currency:''},{USD:1400}),null);assert.equal(quoteWon({...line,unitPrice:0},{USD:1400}),0);
 assert.equal(quoteResultSchema.safeParse({items:[{...line,unitPrice:-1}],warnings:[]}).success,false);
});
test('XLSX external links and excessive evidence fail before AI',async()=>{
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Quote');sheet.addRow(['test']);
 const zip=await JSZip.loadAsync(await book.xlsx.writeBuffer());zip.file('xl/externalLinks/externalLink1.xml','<externalLink/>');
 await assert.rejects(parseQuoteFile('quote.xlsx',await zip.generateAsync({type:'nodebuffer'})));
 for(let i=0;i<151;i++)sheet.addRow(['line',i]);
 await assert.rejects(parseQuoteFile('quote.xlsx',Buffer.from(await book.xlsx.writeBuffer())));
});
test('quote storage rejects foreign owner, stale version/hash and moved sources',async()=>{
 const db=new PGlite(),a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 try{
 await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,service_role;create table projects(id uuid primary key,owner_id uuid);create table messages(id uuid primary key,owner_id uuid,project_id uuid);create table attachments(id uuid primary key,message_id uuid,content_base64 text);grant select on projects,messages,attachments to authenticated;`);
 await db.exec(readFileSync(new URL('../supabase/migrations/008_quotes.sql',import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1),($2)',[a,b]);await db.query('insert into projects values($1,$1),($2,$2)',[a,b]);await db.query('insert into messages values($1,$1,$1)',[a]);await db.query("insert into attachments values($1,$1,'YWJj')",[a]);
 const save=(owner:string,version:number,hash="md5('YWJj')")=>db.query<{version:number|null}>(`select save_quote_review($1,$2,$2,${hash},'sealed',$3) as version`,[owner,a,version]);
 assert.equal((await save(a,0)).rows[0].version,1);assert.equal((await save(a,0)).rows[0].version,null);assert.equal((await save(a,1)).rows[0].version,2);assert.equal((await save(a,1)).rows[0].version,null);
 await assert.rejects(save(b,2),/source_changed/);await assert.rejects(save(a,2,"'wrong'"),/source_changed/);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${b}'`);assert.equal((await db.query('select * from quote_reviews')).rows.length,0);await assert.rejects(save(a,2),/permission/);await db.exec(`set request.jwt.claim.sub='${a}'`);assert.equal((await db.query('select * from quote_reviews')).rows.length,1);
 await db.exec('reset role');await db.query('update messages set project_id=$1',[b]);await db.exec(`set role authenticated;set request.jwt.claim.sub='${a}'`);assert.equal((await db.query('select * from quote_reviews')).rows.length,0);
 }finally{await db.close();}
});
