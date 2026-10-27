"use client";
import {useEffect,useState} from 'react';
export default function MailTranslation({id,active,allowed}:{id:string;active:boolean;allowed:boolean}){
 const [result,setResult]=useState<{isKorean:boolean;translation:string}|null>(null);
 const [error,setError]=useState('');const [retry,setRetry]=useState(0);
 useEffect(()=>{
  if(!active||!allowed||result)return;
  let current=true;setError('');
  fetch('/api/mail-translation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
   .then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'번역하지 못했습니다.');return d;})
   .then(d=>{if(current)setResult(d);}).catch(e=>{if(current)setError(e.message);});
  return()=>{current=false;};
 },[id,active,allowed,retry]);
 return <section aria-label="한국어 번역" style={{marginTop:20,padding:18,border:'2px solid #2563eb',borderRadius:12,background:'#f3f7ff'}}>
 <h3 style={{margin:'0 0 12px',color:'#123c9c',fontWeight:800}}>한국어 번역</h3>
 {!allowed?<p>이 계정의 AI 사용 설정을 확인해 주세요.</p>:error?<p role="alert">{error} <button className="button" onClick={()=>setRetry(x=>x+1)}>다시 시도</button></p>:result?<div style={{whiteSpace:'pre-wrap',lineHeight:1.8}}>{result.isKorean?'한국어로 작성된 메일입니다. 위 원문을 확인해 주세요.':result.translation}</div>:<p role="status">한국어로 번역하고 있습니다…</p>}
 <small>AI 번역 · 가격과 거래 조건은 원문과 함께 확인하세요.</small></section>;
}
