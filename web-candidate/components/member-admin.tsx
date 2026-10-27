'use client';
import { useEffect,useState } from 'react';
type Member={id:string;email:string;state:string;is_operator:boolean;monthly_limit:number;used_tokens:number;held_tokens:number;joined_at:string;last_sign_in_at:string|null;email_confirmed_at:string|null};
type Audit={id:string;action:string;member_id:string|null;created_at:string;details:Record<string,unknown>};
type Invite={id:string;email:string;expires_at:string;consumed_at:string|null;revoked:boolean};
const date=(s:string|null)=>s?new Date(s).toLocaleString('ko-KR'):'—';
export default function MemberAdmin(){
 const [members,setMembers]=useState<Member[]>([]),[audit,setAudit]=useState<Audit[]>([]),[invites,setInvites]=useState<Invite[]>([]),[email,setEmail]=useState(''),[token,setToken]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 async function load(){const r=await fetch('/api/members',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error);setMembers(d.members);setAudit(d.audit);setInvites(d.invites);}
 useEffect(()=>{load().catch(e=>setNotice(e.message));},[]);
 async function mutate(body:object){if(busy)return;setBusy(true);setNotice('');try{const r=await fetch('/api/members',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error);if(d.token)setToken(`${d.email}\n초대코드: ${d.token}\n유효기간: ${date(d.expires_at)}`);await load();setNotice('저장했습니다.');}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}}
 return <section className="surface member-admin" style={{height:'100%',overflow:'auto',padding:20}}><h2>회원 · AI 이용 관리</h2><p>회원 상태와 한국 시간 기준 월별 토큰 한도를 관리합니다. 고객의 메일 본문은 표시하지 않습니다.</p>
 <form onSubmit={e=>{e.preventDefault();setToken('');void mutate({action:'invite',email});}}><label>초대할 이메일<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><button className="button primary" disabled={busy}>7일 초대코드 만들기</button></form>
 {token&&<div role="status"><p>코드는 이번 화면에서만 확인할 수 있습니다. 이메일은 자동 발송되지 않습니다.</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{token}</pre><button onClick={()=>setToken('')}>코드 숨기기</button></div>}
 {notice&&<p role="status">{notice}</p>}
 <p>신규 회원 기본 한도: 0토큰. 사용량 확인이 안 된 요청의 예약량은 계속 유지합니다. 토큰 한도는 검색 도구 비용을 포함한 결제 한도가 아닙니다.</p>
 <div style={{overflowX:'auto'}}><table style={{minWidth:900,width:'100%',textAlign:'left'}}><thead><tr><th>회원 / 가입일</th><th>인증 / 최근 로그인</th><th>사용 / 예약 / 잔여</th><th>상태 · 월 한도</th></tr></thead><tbody>{members.map(m=><tr key={m.id}><td>{m.email}{m.is_operator?' · 운영자':''}<br/>{date(m.joined_at)}</td><td>{m.email_confirmed_at?'인증 완료':'인증 대기'}<br/>{date(m.last_sign_in_at)}</td><td>{Number(m.used_tokens).toLocaleString()} / {Number(m.held_tokens).toLocaleString()} / {Math.max(0,m.monthly_limit-m.used_tokens-m.held_tokens).toLocaleString()}</td><td><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate({id:m.id,state:f.get('state'),monthlyLimit:Number(f.get('limit'))});}}><select name="state" defaultValue={m.state}><option value="active">사용 중</option>{!m.is_operator&&<option value="suspended">이용 정지</option>}</select><input aria-label={`${m.email} 월 토큰 한도`} name="limit" type="number" min={0} max={1000000000} step={1} defaultValue={m.monthly_limit} required/><button className="button" disabled={busy}>변경 저장</button></form></td></tr>)}</tbody></table></div>
 <h3>최근 초대</h3>{invites.map(i=><p key={i.id}>{i.email} · {i.consumed_at?'가입 완료':i.revoked?'취소':new Date(i.expires_at)<new Date()?'만료':'가입 대기'} · {date(i.expires_at)}</p>)}
 <h3>최근 관리 이력</h3>{audit.map(a=><p key={a.id}>{date(a.created_at)} · {a.action} · {members.find(m=>m.id===a.member_id)?.email||String(a.details.email||'')} {a.action==='settings_changed'?` / ${a.details.state} / 한도 ${a.details.monthly_limit}`:''}</p>)}
 </section>;
}
