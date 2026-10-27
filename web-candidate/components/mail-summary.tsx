"use client";
import {useEffect,useState} from 'react';
import type {Message} from '@/lib/types';
type Summary={summary:string;requests:string[];conditions:string[]};
export default function MailSummary({mail,allowed}:{mail:Message;allowed:boolean}){
 const [result,setResult]=useState<Summary|null>(null);
 const [error,setError]=useState('');const [retry,setRetry]=useState(0);
 useEffect(()=>{
  if(!allowed)return;
  let current=true;setError('');setResult(null);
  fetch('/api/mail-summary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:mail.id})})
   .then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'요약하지 못했습니다.');return d;})
   .then(d=>{if(current)setResult(d);}).catch(e=>{if(current)setError(e.message);});
  return()=>{current=false;};
 },[mail.id,allowed,retry]);
 return <section className="dashboard-summary" aria-label="선택한 메일 AI 요약">
  <h3>현재 메일 AI 요약</h3><b>{mail.subject}</b><p>{mail.sender} · {new Date(mail.received_at).toLocaleString('ko-KR')}</p>
  {!allowed?<p>본인 계정의 AI 사용 설정을 확인해 주세요.</p>:error?<p role="alert">{error} <button className="button" onClick={()=>setRetry(x=>x+1)}>다시 시도</button></p>:!result?<p role="status">현재 메일을 요약하고 있습니다…</p>:<>
   <h3>핵심 내용</h3><p style={{whiteSpace:'pre-wrap'}}>{result.summary}</p>
   <h3>요청사항 · 필요한 답변</h3>{result.requests.length?<ul>{result.requests.map((s,i)=><li key={i}>{s}</li>)}</ul>:<p>명시된 요청사항이 없습니다.</p>}
   <h3>금액 · 일정 · 거래조건</h3>{result.conditions.length?<ul>{result.conditions.map((s,i)=><li key={i}>{s}</li>)}</ul>:<p>명시된 조건이 없습니다.</p>}
  </>}
  <small>선택한 메일 본문 기준 · 첨부파일 내용 제외 · AI 사용량 반영</small>
 </section>;
}
