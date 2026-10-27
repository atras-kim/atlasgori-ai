"use client";
import {useRef,useState} from 'react';
import {savedRequest} from './saved-work';
export default function OrganizeAnalysis({savedId,messageId,suggestedName}:{savedId:string;messageId:string;suggestedName:string}) {
 const [name,setName]=useState(suggestedName),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');const pending=useRef(false);
 async function organize(){if(pending.current||!confirmed||!name.trim())return;pending.current=true;setBusy(true);
  try{const value=await savedRequest('/api/organize-analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({savedId,messageId,name,confirmed})});
   setNotice(value.changed?'비공개 프로젝트에 연결했습니다. 첨부파일은 문서함에 자동으로 모입니다.':'이미 분류된 메일이어서 기존 프로젝트를 유지했습니다.');window.dispatchEvent(new Event('atlas-project-organized'));
  }catch(error){setNotice((error as Error).message);}finally{pending.current=false;setBusy(false);setConfirmed(false);}}
 return <details style={{margin:'12px 0'}}><summary>프로젝트로 정리</summary>
  <p className="help-text">저장 당시 분석을 참고합니다. 현재 업무에 맞는 이름인지 확인해 주세요. 같은 이름의 비공개 프로젝트가 있으면 재사용합니다.</p>
  <label>프로젝트명<input value={name} maxLength={120} disabled={busy} onChange={e=>{setName(e.target.value);setConfirmed(false);}}/></label>
  <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>이 메일을 위 비공개 프로젝트에 연결합니다.</label>
  <button className="button" disabled={busy||!confirmed||!name.trim()} onClick={organize}>프로젝트에 연결</button><p role="status">{notice}</p>
 </details>;
}
