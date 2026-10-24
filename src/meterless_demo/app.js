// Drafts use verified comparison values and buyer criteria, never raw PDF instructions.
function makeSupplierDraft(record,criteria){
 const value=k=>record.fields?.[k]?.value||'';
 const warning=(...parts)=>(record.warnings||[]).some(w=>parts.some(p=>w.includes(p)));
 const num=n=>typeof n==='number'&&Number.isFinite(n)?String(n):null;
 const quantity=num(criteria.quantity_mt),days=num(criteria.shipment_days_max),deposit=num(criteria.deposit_percent_max);
 const questions=[],topics=[];
 function add(topic,text){topics.push(topic);questions.push(text);}
 if(warning('MOQ','수량','quantity','moq')){
  const moq=num(record.moq_mt);
  add('주문량·MOQ',moq && record.moq_mt>criteria.quantity_mt && !warning('moq: 복수')
   ?`Your stated minimum order is ${moq} MT. Can you accept our required quantity of ${quantity} MT and issue a consistent revised quotation?`
   :`Please confirm that you can supply ${quantity} MT, state your minimum order quantity, and provide one unambiguous quantity and price basis.`);
 }
 if(warning('선적','shipment')){
  add('선적 일정',`Can you confirm shipment within ${days} calendar days after receipt of the agreed deposit? Please state any other conditions affecting the start date, the shipment date, and the estimated transit time separately. Shipment and arrival dates must be distinguished.`);
 }else{
  add('선적 일정',`Please reconfirm the quoted shipment schedule against our ${days}-day requirement after receipt of the agreed deposit, and provide an estimated transit time separately.`);
 }
 if(warning('보험','운임','금액','가격','복수','unit_price','amount','terms') || record.comparable_total==null || Object.keys(record.assumptions||{}).length){
  let text='Please confirm a consistent Incoterm and named port, and a firm USD price covering goods, ocean freight and cargo insurance to Busan, with each inclusion and exclusion clearly stated.';
  if(/\bCIF\b/i.test(value('terms')) && /separately|별도|excluded|not included/i.test(value('insurance')))
   text+=' The quotation labels the offer CIF but assigns insurance separately to the buyer. Please resolve this inconsistency and identify who arranges and pays for insurance.';
  if(Object.keys(record.assumptions||{}).length)
   text+=' Our comparison used separate demo logistics assumptions; these are not supplier-confirmed charges. Please provide your confirmed freight and insurance amounts.';
  if(record.comparable_total==null)text+=' We have not treated the comparison total as confirmed.';
  add('운임·보험·금액',text);
 }else{
  add('비용·보험 범위','Please reconfirm the quoted freight and insurance inclusions, the insured amount, coverage terms and policy documentation, and all excluded destination charges.');
 }
 if(warning('선금','잔금','결제','payment'))
  add('결제 조건',`Can you offer a deposit of no more than ${deposit}% with the balance payable against a copy of the bill of lading? Please provide revised payment terms for review.`);
 else add('결제 조건','Please reconfirm the quoted deposit and balance payment terms, including the balance payment trigger against a copy of the bill of lading.');
 if(warning('MFR','mfr','품목','product'))
  add('제품 규격',`Please confirm virgin PP homopolymer suitable for injection molding, with MFR ${num(criteria.mfr)} +/- ${num(criteria.mfr_tolerance)} g/10 min tested at 230 C / 2.16 kg, and provide the latest TDS.`);
 if(warning('COA','SDS','TDS','서류','documents'))
  add('필수 서류','Please confirm that you will provide the latest TDS, a shipment-lot COA and SDS, and state when each document will be available.');
 else add('필수 서류','Please share the latest TDS and confirm when the shipment-lot COA and SDS will be provided.');
 add('유효기간',warning('유효기간','validity')?'Please state the quotation validity date, or renew the quotation if it has expired.':'Please reconfirm the quotation validity date.');
 if(warning('목적항','destination'))add('목적항','Please revise or clarify the named destination as Busan, Republic of Korea.');
 const known=record.fields?.supplier?.value;
 // A supplier's name is optional; never use a filename as an invented recipient.
 const title=typeof known==='string' && /^[\p{L}\p{N} .&'()-]{1,80}$/u.test(known)?known:'Supplier';
 const subject=`Clarification request: ${quantity} MT PP quotation - ${title}`;
 const body=['Dear Sales Team,','',`Thank you for your quotation. We are reviewing options for ${quantity} MT of virgin PP homopolymer for injection molding, for Busan, Republic of Korea.`,record.eligible?'The quotation appears to meet our current comparison criteria, subject to confirmation of the points below.':'We need clarification of the following points before completing our comparison.','',...questions.map((q,i)=>`${i+1}. ${q}`),'','Please send your clarification or revised quotation for review. This inquiry is not a purchase order, acceptance of terms, or payment commitment.','','Best regards,','Jongmyoung Kim','AtlasGori AI'].join('\n');
 return {subject,body,topics,supplier_file:record.file,status:'draft_only',recipient:null,sender:'mmm_ceo@naver.com',method:'verified-comparison-rules'};
}
if(typeof module!=='undefined')module.exports={makeSupplierDraft};
if(typeof document!=='undefined'){
const $=id=>document.getElementById(id), token=document.querySelector('meta[name="demo-token"]').content;
let last=null,busy=false,criteriaSource='manual';
for(const id of ['quantity_mt','shipment_days_max','deposit_percent_max','mfr','mfr_tolerance'])$(id).addEventListener('input',()=>{
 criteriaSource='manual';last=null;$('results').hidden=true;
 $('zetarisStatus').textContent='수동 편집 기준 · Zetaris 기준을 적용하려면 다시 불러오세요.';
});
const labels={supplier:'공급업체',product:'품목',destination:'목적항',quantity:'수량',moq:'MOQ',unit_price:'단가',amount:'견적액',terms:'거래조건',freight:'운임',insurance:'보험',shipment:'선적',payment:'결제',mfr:'MFR',documents:'서류',validity:'유효기간'};
const money=n=>n==null?'미확정':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
function el(tag,text,cls){const x=document.createElement(tag);if(text!=null)x.textContent=text;if(cls)x.className=cls;return x;}
async function api(url,opts={}){const res=await fetch(url,{...opts,headers:{'X-Demo-Token':token,...opts.headers}});let data;try{data=await res.json();}catch{throw Error('서버 응답을 읽지 못했습니다. 실행 창과 연결을 확인해 주세요.');}if(!res.ok)throw Error(data.error||`HTTP ${res.status}`);return data;}
async function health(){try{const r=await api('/api/health');$('health').textContent=`Meterless ${r.version} · 로컬 모델 준비됨`;}catch(e){$('health').textContent=e.message;}}
$('files').addEventListener('change',()=>{$('selected').textContent=[...$('files').files].map(f=>`${f.name} (${(f.size/1024).toFixed(0)} KB)`).join(' / ')||'PDF 1~3개를 선택해 주세요.';});
async function encode(file){if(file.size>3*1024*1024)throw Error('파일당 3 MB를 초과할 수 없습니다.');const a=new Uint8Array(await file.arrayBuffer());let s='';for(let i=0;i<a.length;i+=16000)s+=String.fromCharCode(...a.subarray(i,i+16000));return {name:file.name,data:btoa(s)};}
async function start(samples){
 if(busy)return;busy=true;$('error').hidden=true;$('results').hidden=true;last=null;$('progressPanel').hidden=false;$('progress').value=0;$('stage').textContent='파일 준비 중';for(const id of ['analyze','sample','files','quantity_mt','shipment_days_max','deposit_percent_max','mfr','mfr_tolerance'])$(id).disabled=true;
 try{
  let files;
  if(samples){files=(await api('/api/samples')).files;$('selected').textContent='샘플 PDF 3개를 서버에서 읽었습니다. 매번 새로 분석합니다.';}
  else{const selected=[...$('files').files];if(selected.length<1||selected.length>3)throw Error('PDF를 1~3개 선택해 주세요.');files=await Promise.all(selected.map(encode));}
  const criteria={};for(const k of ['quantity_mt','shipment_days_max','deposit_percent_max','mfr','mfr_tolerance']){if($(k).value.trim()==='')throw Error('비교 기준을 모두 입력해 주세요.');criteria[k]=Number($(k).value);if(!Number.isFinite(criteria[k]))throw Error('비교 기준은 숫자로 입력해 주세요.');}
  const job=await api('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({files,criteria,criteria_source:criteriaSource})});
  while(true){const s=await api('/api/jobs/'+job.job_id);$('stage').textContent=s.stage;$('progress').value=s.progress;if(s.status==='error')throw Error(s.stage);if(s.status==='done'){last=s.result;render(last);break;}await new Promise(r=>setTimeout(r,1300));}
 }catch(e){$('error').hidden=false;$('error').textContent=e.message;$('stage').textContent='분석 중단 · 이전 결과는 재사용하지 않습니다.';}
 finally{busy=false;for(const id of ['analyze','sample','files','quantity_mt','shipment_days_max','deposit_percent_max','mfr','mfr_tolerance'])$(id).disabled=false;}
}
function render(data){
 criteriaSource=data.criteria_provenance?.policy_id?'zetaris':'manual';
 for(const [key,value] of Object.entries(data.criteria))if($(key))$(key).value=value;
 history.replaceState(null,'','/?run='+encodeURIComponent(data.run_id));
 $('results').hidden=false;$('winner').textContent=data.recommended_files.length?'우선 협상 후보: '+data.recommended_files.join(', '):'현재 기준을 모두 충족한 견적이 없습니다.';
 const provenance=data.criteria_provenance;
 $('zetarisStatus').textContent=provenance?.policy_id?`이 분석에 적용: Zetaris ${provenance.policy_id} · ${provenance.fetched_at_utc} · 조회 ${provenance.request_id}`:'이 분석에 적용: 수동 입력 기준';
 $('run').textContent=`${data.created_kst} KST · 새 분석 ${data.run_id.slice(0,8)} · ${data.records.length}개 PDF · 주문 ${data.criteria.quantity_mt} MT / 선적 ${data.criteria.shipment_days_max}일 / 선금 ${data.criteria.deposit_percent_max}% 이하`;$('scope').textContent=data.scope;$('rows').replaceChildren();$('evidence').replaceChildren();$('receipts').replaceChildren();
 let draftsSection=$('draftSection');
 if(!draftsSection){
  draftsSection=el('section',null,'panel');draftsSection.id='draftSection';
  draftsSection.append(el('h2','3. 공급업체별 영어 후속 문의 초안'),el('p','검증된 비교 결과와 구매 기준으로 만든 초안입니다. 검토 후 복사하거나 저장할 수 있습니다. 수신 이메일은 입력하지 않았으며 전송 기능은 없습니다.'));
  const container=el('div');container.id='drafts';draftsSection.append(container);
  $('results').insertBefore(draftsSection,$('evidence').closest('section'));
  const evidenceHeading=$('evidence').closest('section').querySelector('h2');if(evidenceHeading)evidenceHeading.textContent='4. 원문과 모델값 확인';
 }
 $('drafts').replaceChildren();
 data.followups=data.records.map(r=>makeSupplierDraft(r,data.criteria));
 for(const [i,draft] of data.followups.entries()){
  const card=el('article',null,'draft-card');card.append(el('h3',draft.supplier_file),el('p','확인 항목: '+draft.topics.join(' · '),'muted'));
  const subject=el('input');subject.type='text';subject.value=draft.subject;subject.setAttribute('aria-label',`${draft.supplier_file} 제목`);
  const body=el('textarea');body.rows=18;body.value=draft.body;body.setAttribute('aria-label',`${draft.supplier_file} 영어 문의 초안`);
  const note=el('small','자동 생성 초안 · 검토 전 · 아직 전송되지 않음');
  const buttons=el('div',null,'actions'),copy=el('button','초안 복사','secondary'),save=el('button','텍스트 저장','secondary');
  const current=()=>`Subject: ${subject.value}\n\n${body.value}`;
  function edited(){draft.subject=subject.value;draft.body=body.value;note.textContent='편집된 초안 · 아직 전송되지 않음';}
  subject.addEventListener('input',edited);body.addEventListener('input',edited);
  copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(current());note.textContent='초안을 복사했습니다. 전송은 하지 않았습니다.';}catch{body.focus();body.select();note.textContent='본문이 선택되었습니다. Ctrl+C로 복사해 주세요.';}});
  save.addEventListener('click',()=>download(`Supplier-followup-${i+1}.txt`,'text/plain;charset=utf-8',current()));
  buttons.append(copy,save);card.append(el('small','Subject'),subject,el('small','Message'),body,note,buttons);$('drafts').append(card);
 }
 for(const r of data.records){
  const tr=el('tr');let td=el('td',r.supplier);td.append(el('small',r.file));tr.append(td);
  td=el('td',money(r.unit_price)+' / MT');td.append(el('small','견적액 '+money(r.quoted_amount)));tr.append(td);
  td=el('td',money(r.comparable_total));td.append(el('small',r.cost_type));if(Object.keys(r.assumptions).length)td.append(el('small','물류 가정 '+JSON.stringify(r.assumptions)));tr.append(td);
  td=el('td',r.shipment_days==null?'확인 필요':`${r.shipment_days}일`);td.append(el('small',r.fields.shipment.value||'미기재'));tr.append(td);
  td=el('td',r.eligible?'기준 충족':'조건 미충족 / 확인 필요',r.eligible?'good':'warn');const list=el('ul');for(const w of r.warnings)list.append(el('li',w));td.append(list);tr.append(td);$('rows').append(tr);
  const detail=el('details');detail.append(el('summary',`${r.file} · 원문 대조 ${r.corrections.length}건 수정`));detail.append(el('small','SHA-256 '+r.sha256));
  const table=el('table',null,'evidence-table'),head=el('tr');for(const t of ['항목','원문 확인값','페이지','Meterless 추출값'])head.append(el('th',t));table.append(head);
  for(const [key,f] of Object.entries(r.fields)){const row=el('tr');for(const text of [labels[key]||key,f.value??'확인 필요',f.page??'-',f.model_value??'미추출'])row.append(el('td',String(text)));table.append(row);}const scroll=el('div',null,'scroll');scroll.append(table);detail.append(scroll);
  for(const p of r.pages){const pd=el('details');pd.append(el('summary',`PDF ${p.page}페이지 추출 원문`),el('pre',p.text));detail.append(pd);}$('evidence').append(detail);
 }
 for(const [i,r] of data.receipts.entries())$('receipts').append(el('p',`${i+1}. HTTP ${r.http_status} · ${r.model} · ${r.privacy} · ${(r.elapsed_ms/1000).toFixed(1)}초 · 비용 $${r.actual_cost_usd??'확인 필요'}`));
}
function download(name,type,body){const url=URL.createObjectURL(new Blob([body],{type})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('analyze').addEventListener('click',()=>start(false));$('sample').addEventListener('click',()=>start(true));
$('json').addEventListener('click',()=>{if(last)download('AtlasGori-analysis.json','application/json',JSON.stringify(last,null,2));});
$('csv').addEventListener('click',()=>{if(!last)return;const cell=x=>'"'+String(x??'').replace(/^\s*[=+@-]/,"'$&").replaceAll('"','""')+'"';const rows=[['견적서','업체','단가 USD/MT','견적액 USD','비교액 USD','비용 확정성','선적일수','검증 경고'],...last.records.map(r=>[r.file,r.supplier,r.unit_price,r.quoted_amount,r.comparable_total,r.cost_type,r.shipment_days,r.warnings.join('; ')])];download('AtlasGori-comparison.csv','text/csv;charset=utf-8','\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n'));});
health();
if($('zetarisStatus')){
 const zStatus=$('zetarisStatus');
 api('/api/zetaris/status').then(r=>{zStatus.textContent=r.message;}).catch(()=>{zStatus.textContent='Zetaris 연결 기능을 사용하려면 새 버전 서버가 필요합니다.';});
 $('zetarisCheck').addEventListener('click',async()=>{
  $('zetarisCheck').disabled=true;zStatus.textContent='Zetaris 실제 SQL 응답 확인 중';
  try{const r=await api('/api/zetaris/check');zStatus.textContent=r.message+' · 구매 기준 조회는 별도 확인';}
  catch(e){zStatus.textContent=e.message;}finally{$('zetarisCheck').disabled=false;}
 });
 $('zetarisPolicy').addEventListener('click',async()=>{
  if(busy)return;$('zetarisPolicy').disabled=true;zStatus.textContent='Zetaris 구매 기준 조회 중';
  try{const r=await api('/api/zetaris/policy');if(busy){zStatus.textContent='PDF 분석이 진행 중입니다. 완료 후 구매 기준을 다시 불러오세요.';return;}for(const [k,v] of Object.entries(r.criteria))if($(k))$(k).value=v;
   // Existing results still describe their original criteria; hide them after a change.
   $('results').hidden=true;last=null;criteriaSource='zetaris';
   zStatus.textContent='Zetaris PP_BUSAN_DEMO 기준을 불러왔습니다. 분석 시작 시 다시 조회해 적용합니다.';
  }catch(e){zStatus.textContent=e.message;}finally{$('zetarisPolicy').disabled=false;}
 });
}
const savedRun=new URLSearchParams(location.search).get('run');
if(savedRun && /^[a-f0-9]{32}$/.test(savedRun)){
 api('/api/jobs/'+savedRun).then(s=>{
  if(s.status!=='done')throw Error('완료된 분석이 아닙니다. PDF를 선택해 다시 분석해 주세요.');
  last=s.result;render(last);$('stage').textContent='완료된 분석 기록';$('progressPanel').hidden=false;$('progress').value=100;
 }).catch(e=>{$('error').hidden=false;$('error').textContent=e.message;});
}
}
