'use client';
import BodyQuotes from './body-quotes';
import {useEffect,useRef,useState} from 'react';
import {FileSpreadsheet,Files,CheckCircle2,ArrowRight} from 'lucide-react';
import {quoteWon,type QuoteResult,type QuoteLine} from '@/lib/quote-schema';
import type {FxSnapshot} from '@/lib/fx';
type RecordRow={attachmentId:string;version:number;stale:boolean;value:{filename:string;current:QuoteResult;original:QuoteResult;reviewed:boolean;evidence:{sources:{id:string;text:string}[];warnings:string[]}}};
const fields: {key:keyof QuoteLine;label:string}[]=[{key:'supplier',label:'업체'},{key:'product',label:'제품'},{key:'specification',label:'규격'},{key:'unitPrice',label:'단가'},{key:'currency',label:'통화(USD 등)'},{key:'unit',label:'가격 단위'},{key:'quantity',label:'수량'},{key:'moq',label:'최소 주문량'},{key:'leadTime',label:'납기'},{key:'incoterm',label:'거래 조건·장소'},{key:'charges',label:'세금·운임'},{key:'validUntil',label:'유효기간'}];
export default function QuoteComparison({projectId,owner,isDemo}:{projectId:string;owner:boolean;isDemo:boolean}){
 const [rows,setRows]=useState<RecordRow[]>([]),[files,setFiles]=useState<{id:string;name:string}[]>([]),[selected,setSelected]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[edit,setEdit]=useState<RecordRow|null>(null),[fx,setFx]=useState<FxSnapshot|null>(null),[offset,setOffset]=useState(0),[total,setTotal]=useState(0);
 const lock=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function load(){const [q,d]=await Promise.all([fetch(`/api/quotes?project=${projectId}`),fetch(`/api/documents?project=${projectId}&offset=${offset}`)]);const [quotes,docs]=await Promise.all([q.json(),d.json()]);if(!q.ok||!d.ok)throw Error(quotes.error||docs.error);if(!alive.current)return;setRows(quotes.quotes);setFiles(docs.files.filter((f:{name:string})=>/\.(pdf|xlsx)$/i.test(f.name)));setTotal(docs.total);}
 useEffect(()=>{if(!owner||isDemo)return;load().catch(e=>{if(alive.current)setError(e.message);});},[projectId,owner,isDemo,offset]);
 useEffect(()=>{let active=true;const loadFx=()=>fetch('/api/fx').then(async r=>{if(r.ok&&active)setFx(await r.json());}).catch(()=>{});void loadFx();const timer=setInterval(loadFx,3600000);return()=>{active=false;clearInterval(timer);};},[]);
 async function request(body:object){if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');try{const r=await fetch('/api/quotes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,project:projectId})});const d=await r.json();if(!r.ok)throw Error(d.error||'처리 실패');if(alive.current){setEdit(null);setConsent(false);setNotice('견적을 저장했습니다. 원문과 비교해 확인해 주세요.');await load();}}catch(e){if(alive.current)setError((e as Error).message);}finally{lock.current=false;if(alive.current)setBusy(false);}}
 async function compareAll(){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('프로젝트 견적서를 찾는 중…');
  const failures:string[]=[];let analyzed=0,cached=0;
  try{
   const existing=await fetch(`/api/quotes?project=${projectId}`);const current=await existing.json();if(!existing.ok)throw Error(current.error);
   const known=new Map<string,RecordRow>(current.quotes.map((r:RecordRow)=>[r.attachmentId,r]));
   const candidates:{id:string;name:string}[]=[];
   for(let start=0;;start+=50){const r=await fetch(`/api/documents?project=${projectId}&offset=${start}`);const d=await r.json();if(!r.ok)throw Error(d.error);
    for(const f of d.files)if(f.document_kind==='quote'||(!f.document_manual&&/quotation|quote|proforma|견적|가격표/i.test(f.name)))candidates.push(f);
    if(start+50>=d.total)break;
   }
   for(const [i,f] of candidates.entries()){
    if(!alive.current)break;
    const old=known.get(f.id);if(old){cached++;if(old.stale)failures.push(`${f.name}: 원문 변경, 기존 분석 확인 필요`);continue;}
    if(!/\.(pdf|xlsx)$/i.test(f.name)){failures.push(`${f.name}: 지원하지 않는 형식`);continue;}
    setNotice(`프로젝트 견적 비교 중 ${i+1}/${candidates.length}`);
    const r=await fetch('/api/quotes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'compare-project',project:projectId,attachmentId:f.id,consent:true})});const d=await r.json();
    if(r.ok)analyzed++;else{failures.push(`${f.name}: ${d.error||'분석 실패'}`);if([402,429,503].includes(r.status)){failures.push(`남은 ${candidates.length-i-1}건은 아직 분석하지 않았습니다.`);break;}}
   }
   if(alive.current){await load();setNotice(`견적 후보 ${candidates.length}건 · 새 분석 ${analyzed}건 · 기존 결과 ${cached}건`);setError(failures.join(' / '));}
  }catch(e){if(alive.current)setError((e as Error).message);}finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 if(!owner||isDemo)return <p className="document-note">견적 비교는 로그인한 프로젝트 소유자가 실제 첨부파일로 사용할 수 있습니다.</p>;
 return <section aria-label="견적 비교" className="quote-comparison"><header className="quote-heading"><div><span className="quote-eyebrow">PROJECT QUOTES</span><h2>조건을 나란히, 판단은 명확하게.</h2><p>견적서의 가격과 거래 조건을 한곳에서 확인하세요.</p></div><span className="quote-format">PDF · Excel</span></header>
 <BodyQuotes key={projectId} projectId={projectId}/>
 <div className="quote-stats"><div><Files size={17}/><span>분석한 문서</span><b>{rows.length}</b></div><div><CheckCircle2 size={17}/><span>확인 완료</span><b>{rows.filter(r=>r.value.reviewed&&!r.stale).length}</b></div><div><FileSpreadsheet size={17}/><span>확인 필요</span><b>{rows.filter(r=>!r.value.reviewed||r.stale).length}</b></div></div>
 <div className="quote-import"><p>이 프로젝트에서 견적서로 분류되었거나 파일명에 견적 표시가 있는 자료를 모두 찾아 비교합니다. 기존 분석은 재사용합니다.</p><p>버튼을 누르면 새 견적 파일의 이름과 추출 텍스트를 OpenAI로 전송하며 AI 사용량이 차감됩니다. 계정별 AI 동의가 필요합니다.</p><button className="button primary" disabled={busy} onClick={compareAll}>{busy?'견적 비교 중…':'프로젝트 전체 견적 비교'}</button><details><summary>분석 범위와 지원 형식</summary><p>텍스트 PDF · XLSX, 파일당 5MB, PDF 20페이지까지. 메일 본문만의 견적이나 견적으로 분류되지 않은 자료는 포함되지 않습니다. 누락된 파일은 문서함에서 견적서로 분류해 주세요. 실패·미지원 자료는 별도 표시합니다.</p></details></div>
 <p className="quote-feedback" role="status">{notice}</p>{error&&<p role="alert">{error}</p>}
 {!!rows.length&&<p className="document-note">단위·운임·세금·거래 조건을 확인해 비교하세요. 원화 환산은 일별 참고 단가이며 총 수입 비용이 아닙니다.</p>}
 {!rows.length&&!error&&<div className="quote-empty"><span className="quote-empty-icon"><FileSpreadsheet size={28}/></span><h3>프로젝트 견적을 한 번에 비교하세요</h3><p>분석이 끝나면 업체별 가격·납기·거래 조건을<br/>같은 표에서 비교할 수 있습니다.</p><ol><li><span>1</span>메일을 프로젝트에 연결</li><li><span>2</span>전체 견적 비교 버튼 클릭</li><li><span>3</span>원문 확인·비교</li></ol></div>}
 {rows.length>0&&<div className="quote-table-wrap"><table className="quote-table"><thead><tr><th>업체 / 제품</th><th>단가 / 단위</th><th>원화 참고 단가</th><th>수량 / MOQ</th><th>납기 / 조건</th><th>확인 / 원문</th></tr></thead><tbody>{rows.flatMap(r=>r.value.current.items.map((item,i)=>{const won=quoteWon(item,fx?.rates||{});return <tr key={`${r.attachmentId}-${i}`}><td><b>{item.supplier||'업체 확인 필요'}</b><p>{item.product||'제품 확인 필요'}</p><small>{item.specification}</small></td><td>{item.unitPrice??'미확인'} {item.currency||'통화 미확인'}<p>/{item.unit||'단위 미확인'}</p><small>원문: {item.priceRaw}</small></td><td>{won===null?'환산 불가':`${won.toLocaleString('ko-KR',{maximumFractionDigits:2})}원`}<p>{item.currency==='KRW'?'원화 견적':fx?.dates?.[item.currency]?`기준일 ${fx.dates[item.currency]}`:'환율 미확인'}</p></td><td>{item.quantity||'미확인'}<p>MOQ: {item.moq||'미확인'}</p></td><td>{item.leadTime||'납기 미확인'}<p>{item.incoterm||'조건 미확인'}</p><small>{item.charges||'세금·운임 미확인'} / 유효: {item.validUntil||'미확인'}</small></td><td><span className="tag">{r.stale?'원문 변경':r.value.reviewed?'사용자 확인':'확인 필요'}</span><p>{r.value.filename}</p><details><summary>근거 보기</summary><p>{item.evidenceIds.join(' · ')}</p><blockquote>{item.excerpt}</blockquote>{r.value.evidence.sources.filter(s=>item.evidenceIds.includes(s.id)).map(s=><pre key={s.id}>{s.id}{'\n'}{s.text}</pre>)}<h4>AI 최초 추출</h4><dl className="quote-original">{fields.map(f=><div key={f.key}><dt>{f.label}</dt><dd>{String(r.value.original.items[i]?.[f.key]??"미확인")||"미확인"}</dd></div>)}</dl></details><a href={`/api/attachment?id=${r.attachmentId}`} target="_blank" rel="noreferrer">원본 다운로드</a><button className="button" disabled={busy||r.stale} onClick={()=>setEdit(structuredClone(r))}>확인·수정</button></td></tr>;}))}</tbody></table></div>}
 {rows.map(r=><div key={r.attachmentId}>{!r.value.current.items.length&&<p>{r.value.filename}: 견적 항목을 찾지 못했습니다.</p>}{[...r.value.evidence.warnings,...r.value.current.warnings].map((w,i)=><p key={i} className="document-note">{r.value.filename} · {w}</p>)}</div>)}
 {edit&&<section className="quote-editor" aria-label="견적 수정"><h3>{edit.value.filename} 확인·수정</h3>{edit.value.current.items.map((item,i)=><fieldset key={i} disabled={busy}><legend>품목 {i+1}</legend><div className="quote-fields">{fields.map(f=><label key={f.key}>{f.label}<input value={item[f.key] as string|number??''} type={f.key==='unitPrice'?'number':'text'} min={f.key==='unitPrice'?0:undefined} step="any" maxLength={500} onChange={e=>{const value=f.key==='unitPrice'?(e.target.value===''?null:Number(e.target.value)):e.target.value;setEdit({...edit,value:{...edit.value,reviewed:false,current:{...edit.value.current,items:edit.value.current.items.map((v,n)=>n===i?{...v,[f.key]:value}:v)}}});}}/></label>)}</div><p>{item.evidenceIds.join(' · ')}: {item.excerpt}</p></fieldset>)}<label className="check-label"><input type="checkbox" disabled={busy} checked={edit.value.reviewed} onChange={e=>setEdit({...edit,value:{...edit.value,reviewed:e.target.checked}})}/>원문과 대조해 금액·단위·조건을 확인했습니다.</label><button className="button primary" disabled={busy} onClick={()=>request({action:'save',attachmentId:edit.attachmentId,version:edit.version,current:edit.value.current,reviewed:edit.value.reviewed})}>수정 저장</button><button className="button" disabled={busy} onClick={()=>setEdit(null)}>취소</button></section>}
 </section>;
}

