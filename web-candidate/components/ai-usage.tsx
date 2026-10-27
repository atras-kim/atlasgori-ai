"use client";
import { useCallback, useEffect, useState } from "react";
type Usage={membership?:{monthly_limit:number;used_tokens:number;held_tokens:number};month:string;input:number;output:number;cached:number;total:number;requests:number;unconfirmed:number;history:{id:string;feature:string;model:string;created_at:string;status:string;total_tokens:number|null}[]};
const names:Record<string,string>={preview:'메일 분석 시험',classification:'메일 분류',brief:'프로젝트 요약',reply:'답신 제안',sourcing:'공급업체 검색'};
export default function AiUsage(){
 const [usage,setUsage]=useState<Usage|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{setBusy(true);try{const r=await fetch('/api/ai-usage',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error('사용량을 불러오지 못했습니다.');setUsage(d);setError('');}catch{setUsage(null);setError('사용량을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.');}finally{setBusy(false);}},[]);
 useEffect(()=>{void refresh();const handler=()=>void refresh();window.addEventListener('atlas-ai-usage',handler);return()=>window.removeEventListener('atlas-ai-usage',handler);},[refresh]);
 const number=(v:number)=>Number(v).toLocaleString('ko-KR');
 return <section className="surface" style={{gridColumn:'1 / -1'}}>
 <div className="section-heading"><h2>내 AI 사용량</h2><button className="text-button" onClick={refresh} disabled={busy}>{busy?'확인 중…':'사용량 새로고침'}</button></div>
 <p className="help-text">{usage?.month||'이번 달'} · 한국 시간 기준 · atlasgori에서 기록한 OpenAI 사용량</p>
 {error?<p role="alert">{error}</p>:usage?<>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:16,margin:'20px 0'}}>
 {[['총 토큰',usage.total],['입력 토큰',usage.input],['출력 토큰',usage.output],['분석 요청',usage.requests]].map(([label,value])=><div key={label}><small>{label}</small><strong style={{display:'block',fontSize:26,color:'#2459df'}}>{number(Number(value))}</strong></div>)}
 </div><p className="help-text">입력 중 캐시 {number(usage.cached)} 토큰 · 합계에 중복 가산하지 않습니다.</p>
 {usage.unconfirmed>0&&<p role="status">{number(usage.unconfirmed)}건은 처리 중이거나 사용량 확인이 필요합니다. 위 합계에는 확인된 토큰만 포함됩니다.</p>}
 {usage.membership&&<p role="status">월 한도 {number(usage.membership.monthly_limit)} · 예약 {number(usage.membership.held_tokens)} · 잔여 {number(Math.max(0,usage.membership.monthly_limit-usage.membership.used_tokens-usage.membership.held_tokens))} 토큰. 요청 전 필요한 양을 예약하며 미확인 요청은 예약을 유지합니다.</p>}<details><summary>최근 분석 내역 {usage.history.length}건</summary>{usage.history.length?<div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left'}}><thead><tr><th>일시</th><th>기능</th><th>모델</th><th>토큰</th></tr></thead><tbody>{usage.history.map(h=><tr key={h.id}><td>{new Date(h.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</td><td>{names[h.feature]||h.feature}</td><td>{h.model}</td><td>{h.status==='reported'?number(h.total_tokens!):'확인 필요'}</td></tr>)}</tbody></table></div>:<p>이번 달 기록된 분석 요청이 없습니다.</p>}</details>
 <p className="help-text">집계 기능 도입 이후 기록입니다. Claude 사용량은 제외하며, 토큰 수는 청구 금액이 아닙니다. 관리자가 정한 월 토큰 한도를 적용합니다. 검색 도구 비용과 추가 결제는 별도입니다.</p>
 </>:<p>사용량을 확인하고 있습니다.</p>}
 </section>;
}
