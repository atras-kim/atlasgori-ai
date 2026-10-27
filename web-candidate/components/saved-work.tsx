"use client";
import { useEffect,useState } from 'react';
export type SavedEntry={id:string;kind:'analysis'|'draft';title:string;version:number;updatedAt:string;value?:any};
export async function savedRequest(url:string,init?:RequestInit) {const response=await fetch(url,{cache:'no-store',...init});const value=await response.json();if(!response.ok)throw new Error(value.error||'저장한 내용을 불러오지 못했습니다.');return value;}
export default function SavedWork({kind,onOpen}:{kind:'analysis'|'draft';onOpen:(entry:SavedEntry)=>void}) {
  const [rows,setRows]=useState<SavedEntry[]>([]),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{let alive=true;const load=()=>{savedRequest(`/api/saved-work?kind=${kind}`).then(value=>{if(alive){setRows(value);setNotice('');}}).catch(error=>{if(alive)setNotice(error.message);});};load();window.addEventListener('atlas-saved-work',load);return()=>{alive=false;window.removeEventListener('atlas-saved-work',load);};},[kind]);
  async function open(id:string) {if(busy)return;setBusy(true);try{const [entry]=await savedRequest(`/api/saved-work?id=${id}`);onOpen(entry);setNotice('저장한 내용을 열었습니다.');}catch(error){setNotice((error as Error).message);}finally{setBusy(false);}}
  return <details style={{margin:'12px 0'}}><summary>저장된 {kind==='analysis'?'분석':'초안'} · {rows.length}개</summary>
    <p className="help-text">본인만 볼 수 있습니다. 최근 50개를 표시합니다.</p>
    {rows.map(row=><div key={row.id} style={{display:'flex',gap:10,alignItems:'center',marginBottom:8}}><button className="button" disabled={busy} onClick={()=>open(row.id)}>{row.title}</button><small>{new Date(row.updatedAt).toLocaleString('ko-KR')}</small></div>)}
    {!rows.length && !notice && <p>아직 저장한 내용이 없습니다.</p>}<p role="status">{notice}</p>
  </details>;
}
