'use client';
import {useEffect,useState} from 'react';
export default function ProjectMails({projectId}:{projectId:string}){
 const [rows,setRows]=useState<{id:string;subject:string;sender:string;body:string;received_at:string}[]>([]),[offset,setOffset]=useState(0),[total,setTotal]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;setBusy(true);setRows([]);setError('');fetch(`/api/project-mails?project=${projectId}&offset=${offset}`).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(active){setRows(d.messages);setTotal(d.total);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[projectId,offset]);
 return <section className="project-mails" style={{flex:1,minHeight:0,overflow:"auto"}}><p>이 프로젝트의 메일 {total}건</p>{error&&<p role="alert">{error}</p>}{busy&&<p role="status">메일을 불러오는 중…</p>}{rows.map(m=><details key={m.id} className="surface" style={{padding:14,marginBottom:8}}><summary><strong>{m.subject||'(제목 없음)'}</strong> · {m.sender} · {new Date(m.received_at).toLocaleDateString('ko-KR')}</summary><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{m.body}</p></details>)}{!busy&&!error&&!rows.length&&<p>이 프로젝트에 연결된 메일이 없습니다.</p>}<button className="button" disabled={busy||offset===0} onClick={()=>setOffset(offset-50)}>이전</button><button className="button" disabled={busy||offset+50>=total} onClick={()=>setOffset(offset+50)}>다음</button></section>;
}

