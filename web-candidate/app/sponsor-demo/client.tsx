'use client';
import {useEffect,useRef,useState} from 'react';
import type {JobView} from '@/lib/sponsors/worker-protocol';
export default function SponsorDemoClient(){
 const [job,setJob]=useState<JobView|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const stop=useRef<AbortController|null>(null);
 useEffect(()=>()=>stop.current?.abort(),[]);
 async function run(){
  const controller=new AbortController();stop.current=controller;setBusy(true);setError('');setJob(null);
  try{
   const start=await fetch('/api/sponsor-demo',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario:'paper-packaging',requestId:crypto.randomUUID()})});
   if(!start.ok)throw Error();let current:JobView=await start.json();setJob(current);const deadline=Date.now()+300000;
   while(['queued','running'].includes(current.status)){
    if(Date.now()>deadline)throw Error();await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(Error());};const timer=setTimeout(()=>{controller.signal.removeEventListener('abort',abort);resolve();},2000);controller.signal.addEventListener('abort',abort,{once:true});});
    const response=await fetch('/api/sponsor-demo?id='+current.id,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error();current=await response.json();setJob(current);
   }
  }catch{if(!controller.signal.aborted)setError('검증 상태를 확인하지 못했습니다. 작업이 종료됐는지 확인한 뒤 다시 시도해 주세요.');}
  finally{if(stop.current===controller)setBusy(false);}
 }
 async function cancel(){if(!job)return;try{const response=await fetch('/api/sponsor-demo?id='+job.id,{method:'DELETE'});if(!response.ok)throw Error();setJob(await response.json());}catch{setError('취소 여부를 확인하지 못했습니다. 상태 확인을 계속합니다.');}}
 const ko:Record<string,string>={queued:'실행 대기',running:'검증 중',succeeded:'검증 완료',failed:'검증 실패',cancelled:'취소됨',expired:'시간 초과',interrupted:'실행 중단'};
 return <main style={{maxWidth:900,margin:'40px auto',padding:24}}><a href='/workspace'>워크스페이스로 돌아가기</a><h1>후원사 합성 데이터 검증</h1><p>실제 고객 데이터 없이 가상 공급업체 두 곳을 조회하고 재생 종이 공급업체를 선택합니다. 운영자만 실행할 수 있습니다.</p><p>선택 결과와 로컬 실행 영수증을 확인한 뒤, 합성 데이터 전용 메모리의 저장과 재조회를 검증합니다. 메모리는 H-MEM 규격 일부를 구현한 로컬 저장소입니다.</p><button disabled={busy} onClick={run}>{busy?'검증 진행 중…':'합성 데이터로 검증 실행'}</button>{busy&&job&&['queued','running'].includes(job.status)&&<button onClick={cancel}>검증 취소</button>}{error&&<p role='alert'>{error}</p>}{job&&<section><h2>{ko[job.status]||'상태 확인 중'}</h2>{job.result&&<><p>{job.result.verification==='live-synthetic-services'?'실제 서비스 호출 확인':'모의 서비스 시험'} · 선택: {job.result.selected}</p><p>이전 기억 {job.result.memory.priorRecallCount}건 → 재조회 {job.result.memory.recallCount}건</p><details><summary>검증 근거</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(job.result,null,2)}</pre></details></>}{job.status!=='succeeded'&&!['queued','running'].includes(job.status)&&<p>이번 작업은 성공으로 확인되지 않았습니다. 운영자에게 문의해 주세요.</p>}</section>}</main>;
}