'use client';
import {useState,useRef,useEffect} from 'react';
import type {QuoteResult} from '@/lib/quote-schema';
export default function BodyQuotes({projectId}:{projectId:string}){
 const [rows,setRows]=useState<(QuoteResult&{messageId:string;subject:string})[]>([]),[busy,setBusy]=useState(false),[status,setStatus]=useState('');const active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 async function run(){if(busy)return;setBusy(true);setRows([]);setStatus('메일 본문을 확인하는 중…');let count=0;const issues:string[]=[];
 try{for(let offset=0;;offset+=50){const r=await fetch(`/api/project-mails?project=${projectId}&offset=${offset}`),d=await r.json();if(!r.ok)throw Error(d.error);
 for(const m of d.messages){if(!active.current)return;setStatus(`본문 분석 ${++count}/${d.total}`);const response=await fetch('/api/body-quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:projectId,message:m.id,consent:true})});const result=await response.json();if(response.ok){if(active.current)setRows(old=>[...old,result]);}else{issues.push(`${m.subject}: ${result.error}`);if([402,429,503].includes(response.status))throw Error(issues.join(' / '));}}
 if(offset+50>=d.total)break;}
 if(active.current)setStatus(`본문 ${count}건 확인 완료. ${issues.join(' / ')}`);
 }catch(e){if(active.current)setStatus(`일부 분석이 완료되지 않았습니다. ${(e as Error).message}`);}finally{if(active.current)setBusy(false);}}
 return <section className="quote-import"><h3>첨부 없는 본문 견적·인보이스</h3><p>프로젝트의 메일 제목·발신자·본문을 OpenAI에 전달해 가격·수량·결제 조건을 분석합니다. 실행할 때마다 사용량이 차감되며 결과는 현재 화면에서만 유지됩니다.</p><button className="button primary" disabled={busy} onClick={run}>{busy?'본문 분석 중…':'프로젝트 전체 본문 견적 비교'}</button><p role="status">{status}</p><div className="quote-table-wrap"><table className="quote-table"><thead><tr><th>출처 / 업체</th><th>제품 / 수량</th><th>단가 / 통화 / 단위</th><th>납기 / 조건</th></tr></thead><tbody>{rows.flatMap(row=>row.items.map((item,i)=><tr key={`${row.messageId}-${i}`}><td>{row.subject}<p>{item.supplier}</p><details><summary>본문 근거</summary>{item.excerpt}</details></td><td>{item.product}<p>{item.quantity}</p><small>{item.specification}</small></td><td>{item.unitPrice??'단가 미확인'} {item.currency} / {item.unit}<p>{item.priceRaw}</p></td><td>{item.leadTime}<p>{item.incoterm}</p><small>{item.charges}</small></td></tr>))}</tbody></table></div>{rows.map(r=><div key={r.messageId}>{r.warnings.map((w,i)=><p key={i}>{r.subject}: {w}</p>)}</div>)}<small>본문과 첨부 견적이 같은 거래일 수 있습니다. 합산하거나 최저가로 단정하지 않고 원문과 비교해 주세요.</small></section>;
}

