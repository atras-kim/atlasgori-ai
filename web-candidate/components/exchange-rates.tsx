"use client";
import { useEffect, useRef, useState } from 'react';
import { FX_CURRENCIES, FX_REFRESH_MS, rateChange, type FxSnapshot } from '@/lib/fx';
const money = (value: number) => value.toLocaleString('ko-KR', {minimumFractionDigits:2,maximumFractionDigits:2});
const time = (value: string) => new Date(value).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'});
export default function ExchangeRates() {
  const [open,setOpen] = useState(false), [error,setError] = useState(false);
  const [history,setHistory] = useState<(FxSnapshot & {checkedAt:string})[]>([]);
  const last = useRef(0);
  useEffect(()=>{
    let alive=true, pending=false;
    async function refresh() {
      if(pending) return;
      pending=true;
      try {
        const response=await fetch('/api/fx',{cache:'no-store'});
        if(!response.ok) throw Error();
        const value=await response.json() as FxSnapshot;
        if(!value.rates?.USD || !value.dates?.USD) throw Error();
        if(alive) { last.current=Date.now();setError(false);setHistory(previous=>[{...value,checkedAt:new Date().toISOString()},...previous].slice(0,24)); }
      } catch { if(alive) setError(true); }
      finally { pending=false; }
    }
    void refresh();
    const timer=setInterval(refresh,FX_REFRESH_MS);
    const resume=()=>{ if(document.visibilityState==='visible' && Date.now()-last.current>=FX_REFRESH_MS) void refresh(); };
    document.addEventListener('visibilitychange',resume);
    return()=>{alive=false;clearInterval(timer);document.removeEventListener('visibilitychange',resume);};
  },[]);
  const current=history[0], previous=history[1];
  return <div className="fx">
    <span>1 USD =</span><strong>{current ? `${money(current.rates.USD)}원` : '—'}</strong>
    <small>{error ? (current ? '갱신 실패 · 이전 값 유지' : '환율 연결 실패') : current ? `${time(current.checkedAt)} 확인 · 일별 참고 · 매시간 갱신` : '환율 확인 중'}</small>
    <button onClick={()=>setOpen(!open)} aria-expanded={open}>더보기</button>
    {open && <div className="fx-pop" style={{minWidth:340,maxHeight:'70vh',overflowY:'auto'}}>
      <b>외화 1단위당 원화 · 직전 조회 대비</b>
      {FX_CURRENCIES.map(code=>{
        const value=current?.rates[code], change=value ? rateChange(value,previous?.rates[code]) : null;
        return <div key={code} style={{display:'block',padding:'8px 0',borderBottom:'1px solid #edf0f5'}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12}}><span>1 {code}</span><strong>{value ? `${money(value)}원` : '자료 없음'}</strong></div>
          <small>{change ? `${change.won>0?'▲':change.won<0?'▼':'—'} ${money(Math.abs(change.won))}원 (${change.percent>0?'+':''}${change.percent.toFixed(2)}%)` : value ? '첫 조회 · 비교 대기' : '기준환율 자료 없음'}{current?.dates[code] ? ` · ${current.dates[code]} 기준` : ''}</small>
        </div>;
      })}
      <small>JPY도 100엔이 아닌 1엔 기준입니다.<br/>Frankfurter · 일별 참고환율. 시간별 시장 시세가 아닙니다.<br/>화면이 열려 있는 동안 1시간마다 확인하며, 데이터가 같으면 변동 없음으로 표시합니다.</small>
      {history.length>0 && <details><summary>조회 기록 · 최근 {history.length}회</summary>{history.map(row=><div key={row.checkedAt}><small>{new Date(row.checkedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</small><strong>USD {money(row.rates.USD)}원</strong></div>)}</details>}
    </div>}
  </div>;
}
