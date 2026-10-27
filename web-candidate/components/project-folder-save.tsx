'use client';
import {useEffect,useState} from 'react';
import JSZip from 'jszip';
type Dir={getDirectoryHandle:(name:string,options:{create:boolean})=>Promise<Dir>;getFileHandle:(name:string,options?:{create:boolean})=>Promise<{createWritable:()=>Promise<{write:(data:Blob)=>Promise<void>;close:()=>Promise<void>}>}>};
export default function ProjectFolderSave(){
 const [projects,setProjects]=useState<{id:string;name:string}[]>([]),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{fetch('/api/workspace').then(r=>r.ok?r.json():Promise.reject()).then(d=>{const own=d.projects.filter((p:{owner_id:string})=>p.owner_id===d.userId);setProjects(own);setSelected(own[0]?.id||'');}).catch(()=>setNotice('프로젝트 목록을 불러오지 못했습니다.'));},[]);
 async function save(){setBusy(true);setNotice('');try{
  const picker=(window as unknown as {showDirectoryPicker?:(options:{mode:string;startIn:string})=>Promise<Dir>}).showDirectoryPicker;
  const root=picker?await picker.call(window,{mode:'readwrite',startIn:'desktop'}):null;
  const r=await fetch(`/api/project-export?project=${encodeURIComponent(selected)}`);if(!r.ok){const d=await r.json();throw new Error(d.error||'저장 실패');}
  const blob=await r.blob();
  if(!root){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Atlasgori-project.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);setNotice('ZIP 파일을 다운로드했습니다. 바탕화면에서 압축을 풀어 주세요.');return;}
  const zip=await JSZip.loadAsync(blob);let saved=0,skipped=0;
  for(const entry of Object.values(zip.files)){const parts=entry.name.split('/').filter(Boolean);if(parts.some(p=>p==='..'||p==='.'||/[\\:]/.test(p)))throw new Error('잘못된 저장 경로입니다.');let dir=root;for(const part of parts.slice(0,entry.dir?undefined:-1))dir=await dir.getDirectoryHandle(part,{create:true});if(entry.dir)continue;
   const name=parts[parts.length-1];try{await dir.getFileHandle(name);skipped++;continue;}catch(e){if((e as DOMException).name!=='NotFoundError')throw e;}
   const file=await dir.getFileHandle(name,{create:true}),writer=await file.createWritable();await writer.write(await entry.async('blob'));await writer.close();saved++;
  }setNotice(`Atlasgori 폴더에 ${saved}개 저장했습니다. 기존 파일 ${skipped}개는 유지했습니다.`);
 }catch(e){setNotice((e as DOMException).name==='AbortError'?'폴더 선택을 취소했습니다.':`저장을 완료하지 못했습니다. 일부 파일은 저장되었을 수 있습니다. ${e instanceof Error?e.message:''}`);}finally{setBusy(false);}}
 return <section className="surface" style={{gridColumn:'1 / -1',padding:20}}><h2>내 PC에 프로젝트 자료 보관</h2><p>바탕화면을 선택하면 Atlasgori → 프로젝트 → 회사 → 자료 종류 폴더에 저장합니다.</p><label>저장할 프로젝트 <select value={selected} onChange={e=>setSelected(e.target.value)} disabled={busy}>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className="button primary" onClick={save} disabled={!selected||busy}>{busy?'저장 중…':'프로젝트 폴더를 만들고 저장'}</button><p role="status">{notice}</p><small>버튼을 누른 시점의 메일과 첨부파일을 저장합니다. 폴더 선택 미지원 브라우저는 ZIP으로 다운로드합니다. 설치만으로는 폴더가 생성되지 않습니다. 프로젝트당 최대 100MB.</small></section>;
}

