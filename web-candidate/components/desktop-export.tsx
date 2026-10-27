'use client';
import {useEffect,useState} from 'react';
type Status={enabled:boolean;saved:number;skipped:number;conflicts:number;failed:number;updatedAt?:string;busy?:boolean};
export default function DesktopExport(){
 const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;const load=()=>fetch('/api/desktop-export').then(r=>r.ok?r.json():null).then(s=>{if(active)setStatus(s);}).catch(()=>{});void load();const timer=setInterval(load,15000);return()=>{active=false;clearInterval(timer);};},[]);
 if(!status?.enabled)return null;
 return <section className="surface" style={{gridColumn:'1 / -1'}}><div className="section-heading"><h2>바탕화면 프로젝트 정리</h2><span className="tag">자동 저장 연결됨</span></div><p>이 PC의 바탕화면 → 프로젝트 정리 → 프로젝트별 폴더 → 회사별 폴더</p><p>메일 내용 · 이미지 · 견적서 · 발주서 · 브로셔 · 계약서 · 검토 필요</p><p>앱이 열려 있을 때 메일 동기화·분류 후 저장합니다. 회사명이 확인되지 않으면 발신 주소별로 보관합니다. 기존 폴더와 파일은 유지하며 새 구조에 저장합니다.</p><button className="button" disabled={busy||status.busy} onClick={async()=>{setBusy(true);setError('');try{const r=await fetch('/api/desktop-export',{method:'POST'});const d=await r.json();if(!r.ok)throw new Error(d.error);setStatus(d);}catch(e){setError(e instanceof Error?e.message:'저장 실패');}finally{setBusy(false);}}}>{busy?'저장 중…':'지금 폴더에 저장'}</button><p role="status">{status.updatedAt?`최근 확인 ${new Date(status.updatedAt).toLocaleString('ko-KR')} · 새 파일 ${status.saved}개 · 기존 파일 ${status.skipped}개 · 충돌 ${status.conflicts}개 · 실패 ${status.failed}개`:'첫 저장 대기'}{error&&` · ${error}`}</p><small>PDF·Office·이미지 내용 인식은 아직 지원하지 않아 문서 종류는 파일명과 수동 분류를 사용합니다. 애매한 파일은 검토 필요에 보관합니다.</small></section>;
}

