"use client";
import {useRef,useState} from 'react';
import type {Draft} from '@/lib/types';
import {savedRequest} from './saved-work';
export default function SaveDraft({draft,disabled,onChange,onBusy,notify}:{draft:Draft;disabled:boolean;onChange:(draft:Draft)=>void;onBusy:(value:boolean)=>void;notify:(text:string)=>void}) {
 const pending=useRef(false);const [savedBody,setSavedBody]=useState('');
 async function save(){if(pending.current||disabled)return;pending.current=true;onBusy(true);
  try{const saved=await savedRequest('/api/saved-work',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'draft',id:draft.savedId,version:draft.savedVersion,value:draft})});
   const next={...draft,savedId:saved.id,savedVersion:saved.version};onChange(next);setSavedBody(JSON.stringify(next));window.dispatchEvent(new Event('atlas-saved-work'));notify('초안을 저장했습니다. 연결 계정 → 저장된 초안에서 다시 열 수 있습니다.');
  }catch(error){notify((error as Error).message);}finally{pending.current=false;onBusy(false);}}
 return <div style={{margin:'12px 0'}}><button type="button" className="button" disabled={disabled||!draft.accountId} onClick={save}>임시저장</button> <small>{savedBody===JSON.stringify(draft)?'저장 완료':'변경 후 임시저장을 눌러 주세요.'} 저장본은 발송 후에도 보관됩니다.</small></div>;
}
