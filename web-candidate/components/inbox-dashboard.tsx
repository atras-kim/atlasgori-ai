"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, Folder, Paperclip, Search, Send, Sparkles, TrendingUp, X } from "lucide-react";
import type { Draft, Message } from "@/lib/types";
import InboxView, { type InboxProps } from "./inbox-view";
import Composer from "./composer";
import MailSummary from "./mail-summary";


type Props = InboxProps & {
  parkedDrafts: { current: Map<string, Draft> };
  draft: Draft | null;
  onDraft: (draft: Draft | null) => void;
  onSent: () => Promise<void>;
  composeKey: number;
  composeFocus: number;
  onSource: (query: string) => void;
  onComposeBusy: (busy: boolean) => void;
  composeBusy: boolean;
};
export default function InboxDashboard(props: Props) {
  const { data, filtered, setSelected, account, setAccount, query, setQuery, draft, onDraft, onSent, isDemo, setNotice, setView, setProject } = props;
  const [panel, setPanel] = useState<"read" | "brief">("read");
  const [mobilePane, setMobilePane] = useState<"list" | "work">("list");
  const [unread, setUnread] = useState(false);
  const [trash, setTrash] = useState(false);
  const [trashRows, setTrashRows] = useState<Message[]>([]);
  const [trashCount, setTrashCount] = useState(0);
  const [trashPage, setTrashPage] = useState(0);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashBusy, setTrashBusy] = useState(false);
  const [removed, setRemoved] = useState<string[]>([]);
  const [trashError, setTrashError] = useState('');
  const [trashSelected, setTrashSelected] = useState('');
  async function loadTrash(page: number) {
    setTrashLoading(true); setTrashError('');
    try {
      const response = await fetch(`/api/inbox-trash?page=${page}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '휴지통을 불러오지 못했습니다.');
      if (page > 0 && !result.messages.length) { await loadTrash(Math.max(0, Math.ceil(result.count / 50) - 1)); return; }
      setTrashRows(result.messages); setTrashCount(result.count); setTrashPage(page);
    } catch (error) { setTrashError(error instanceof Error ? error.message : '휴지통 조회 실패'); }
    finally { setTrashLoading(false); }
  }
  async function moveMail(message: Message, restore: boolean) {
    if (isDemo) { setNotice('로그인 후 본인 메일을 정리할 수 있습니다.'); return; }
    setTrashBusy(true);
    try {
      const response = await fetch('/api/inbox-trash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: message.id, restore }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '메일 정리에 실패했습니다.');
      setRemoved(ids => restore ? ids.filter(id => id !== message.id) : [...ids, message.id]);
      if (restore) await loadTrash(trashPage);
      await onSent();
      setNotice(restore ? '통합 Inbox로 복원했습니다. 목록에는 최신 250건이 표시됩니다.' : 'ATLAS 휴지통으로 이동했습니다. 원본 메일과 프로젝트 자료는 유지됩니다.');
    } catch (error) { setNotice(error instanceof Error ? error.message : '메일 정리 실패'); }
    finally { setTrashBusy(false); }
  }
  const [source, setSource] = useState("Soybean Oil 업체 100곳 찾아줘");
  const [epoch, setEpoch] = useState(0);
  const [projectFilter, setProjectFilter] = useState("all");
  const project = data.projects.find(p => p.id === projectFilter) || data.projects.find(p => p.id === props.mail?.project_id) || data.projects[0];
  const inboxRows = filtered.filter(m => !removed.includes(m.id));
  const rows = trash ? trashRows : inboxRows.filter(m => (!unread || m.unread) && (projectFilter === "all" || m.project_id === projectFilter));
  const visibleMail = rows.find(m => m.id === (trash ? trashSelected : props.mail?.id)) || rows[0];
  const parkedDrafts = props.parkedDrafts;
  const previousMail = useRef(visibleMail?.id);
  const [parkedCount, setParkedCount] = useState(parkedDrafts.current.size);
  useEffect(() => {
    if (props.composeBusy || previousMail.current === visibleMail?.id) return;
    if (draft) parkedDrafts.current.set(draft.sourceMessageId || 'new', draft);
    const next = visibleMail ? parkedDrafts.current.get(visibleMail.id) : undefined;
    if (visibleMail) parkedDrafts.current.delete(visibleMail.id);
    onDraft(next || null);
    previousMail.current = visibleMail?.id;
    setParkedCount(parkedDrafts.current.size);
    setEpoch(v=>v+1); setPanel('read');
  }, [visibleMail?.id, props.composeBusy]);
  const activeDraft = draft || { accountId: data.accounts[0]?.id || "", to: "", cc: "", bcc: "", subject: "", body: "", attachments: [] };
  useEffect(() => { if (draft) { setPanel("read"); setMobilePane("work"); } }, [props.composeKey, props.composeFocus]);
  const current = useRef({ draft, busy: props.composeBusy });
  current.current = { draft, busy: props.composeBusy };
  function acceptReply(next: Draft) {
    const { draft: existing, busy } = current.current;
    if (next.sourceMessageId && next.sourceMessageId !== visibleMail?.id) { setNotice('선택한 메일이 바뀌었습니다. 현재 메일에서 다시 발송 준비를 눌러 주세요.'); return; }
    if (existing && existing.sourceMessageId !== next.sourceMessageId && !busy) {
      parkedDrafts.current.set(existing.sourceMessageId || 'new', existing); setParkedCount(parkedDrafts.current.size);
    } else if (busy || (existing && (existing.to || existing.cc || existing.bcc || existing.subject || existing.body || existing.attachments.length))) {
      setNotice("작성 중인 초안이 있습니다. 기존 초안을 완료하거나 닫은 후 제안을 적용해 주세요."); return;
    }
    onDraft(next); setEpoch(v=>v+1); setPanel("read"); setMobilePane("work");
    setNotice("수신 언어로 변환했습니다. 아래에서 최종 내용과 수신자를 확인하고 발송해 주세요.");
  }
  function openBrief() { if (project) { setProject(project.id); setView("projects"); } }
  return <div className={`reference-dashboard desk-${mobilePane}`}>
    <div className="desk-mobile-tabs"><button aria-pressed={mobilePane === "list"} onClick={()=>setMobilePane("list")}>메일 목록</button><button aria-pressed={mobilePane === "work"} onClick={()=>setMobilePane("work")}>메일 읽기 · 답신 · 요약</button></div>
    <div className="dashboard-center">
      <div className="dashboard-project-heading">
        <Folder size={30} fill="#ffd173" stroke="#f7bd4f" />
        <div><select aria-label="프로젝트별 메일 보기" value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
          <option value="all">모든 프로젝트</option>
          {data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select><p>메일부터 다음 액션까지, 비즈니스의 흐름을 한곳에서.</p></div>
        <button className="button" onClick={() => setView("projects")}>프로젝트 관리</button>
      </div>
      <details className="quick-sourcing">
        <summary className="quick-title"><Sparkles size={19} /><b>AI 소싱 요청</b><span>검색 조건 입력</span><ChevronDown size={15}/></summary>
        <form onSubmit={e => { e.preventDefault(); props.onSource(source); setView("sourcing"); }}>
          <label><Search size={20} /><input aria-label="소싱 요청" required value={source} onChange={e => setSource(e.target.value)} /></label>
          <button className="button primary"><Send size={17} />소싱으로 이동</button>
        </form>
        <div className="quick-examples"><span>예시</span>{["브라질 대두유 수출업체", "한국 PP Resin 제조사"].map(s => <button key={s} onClick={() => setSource(s)}>{s}</button>)}</div>
      </details>
      <section className="dashboard-mailbox">
        <div className="dashboard-mail-tools"><div className="tabs">
          <button className={!trash && !unread ? "selected" : ""} onClick={() => {setTrash(false);setUnread(false);}}>전체 <span>{inboxRows.length}</span></button>
          <button className={!trash && unread ? "selected" : ""} onClick={() => {setTrash(false);setUnread(true);}}>안 읽음 <span>{inboxRows.filter(m => m.unread).length}</span></button>
          <button className={trash ? 'selected' : ''} disabled={trashBusy || trashLoading || isDemo} onClick={() => {setTrash(true);setPanel('read');void loadTrash(0);}}>휴지통</button>
        </div><select aria-label="메일 계정 필터" value={account} onChange={e => setAccount(e.target.value)}><option value="all">모든 계정</option>{data.accounts.map(a => <option key={a.id} value={a.id}>{a.email}</option>)}</select></div>
        <label className="dashboard-search"><Search size={17} /><input aria-label="모든 계정에서 검색" placeholder="메일, 업체, 제품 검색" value={query} onChange={e => setQuery(e.target.value)} /></label>
        {trash && <div className="help-text">ATLAS 휴지통 · 모든 계정 · {trashCount}건<br/>원본 메일과 프로젝트 자료는 유지됩니다. <button disabled={trashLoading || trashPage === 0} onClick={()=>void loadTrash(trashPage-1)}>이전</button> {trashPage+1} <button disabled={trashLoading || (trashPage+1)*50 >= trashCount} onClick={()=>void loadTrash(trashPage+1)}>다음</button></div>}
        {trashError && <p role="alert">{trashError}</p>}
        {trashLoading && <p role="status">휴지통 불러오는 중…</p>}
        <div className="dashboard-mail-rows" tabIndex={0} aria-label="메일 목록">{rows.map(m => <button className={`dashboard-mail-row ${m.unread ? "is-unread" : ""}`} aria-pressed={visibleMail?.id === m.id} key={m.id} disabled={props.composeBusy} onClick={() => { setSelected(m.id); setTrashSelected(m.id); if (!props.composeBusy) { setPanel("read"); setMobilePane("work"); } }}>
            <span className="avatar">{m.sender.split("<")[0].trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("")}</span>
          <span className="row-sender"><b>{m.sender.split("<")[0]}</b><small>{data.accounts.find(a => a.id === m.account_id)?.email || "공유 메일"}</small></span>
          <span className="row-message"><b>{m.subject}</b><small>{m.body.slice(0,100)}</small></span>
          <span className="row-time">{new Date(m.received_at).toLocaleDateString("ko-KR",{month:"short",day:"numeric"})}<small>{m.attachments.length > 0 && <Paperclip size={15}/>} {m.unread ? "안 읽음" : "읽음"}</small></span>
        </button>)}{!rows.length && <div className="empty-state">검색 조건에 맞는 메일이 없습니다.</div>}</div>
      </section>
    </div>
    <div className="dashboard-right">
      {parkedCount > 0 && <details><summary>보관 중인 작성 초안 {parkedCount}개 · 현재 화면에서 유지</summary>{Array.from(parkedDrafts.current.entries()).map(([id,saved])=><button key={id} className="button" disabled={props.composeBusy} onClick={()=>{
        if (saved.sourceMessageId && !data.messages.some(m=>m.id===saved.sourceMessageId) && !trashRows.some(m=>m.id===saved.sourceMessageId)) { setNotice("원메일을 목록에서 먼저 불러와 주세요. 초안은 보관되어 있습니다."); return; }
        if (draft) parkedDrafts.current.set(draft.sourceMessageId || 'new',draft);
        parkedDrafts.current.delete(id);
        if (saved.sourceMessageId) { setAccount('all'); setQuery(''); setProjectFilter('all'); setUnread(false); setTrash(trashRows.some(m=>m.id===saved.sourceMessageId)); setTrashSelected(saved.sourceMessageId); setSelected(saved.sourceMessageId); previousMail.current=saved.sourceMessageId; }
        onDraft(saved); setParkedCount(parkedDrafts.current.size); setEpoch(v=>v+1); setPanel('read');
      }}>{saved.subject || '제목 없는 초안'}</button>)}</details>}
      <div className="desk-panel-tabs" aria-label="작업 영역"><button disabled={props.composeBusy} aria-pressed={panel === "read"} onClick={()=>setPanel("read")}>메일 읽기</button><button disabled={props.composeBusy} aria-pressed={panel === "brief"} onClick={()=>setPanel("brief")}>AI 요약</button></div>
      <div className="desk-reader" hidden={panel !== "read"}>
        {visibleMail && <div style={{padding:'8px 16px',borderBottom:'1px solid #cbd5e1'}}><button className="button" disabled={trashBusy || trashLoading || isDemo || props.composeBusy || visibleMail.owner_id !== data.userId} onClick={()=>void moveMail(visibleMail,trash)}>{trashBusy ? '처리 중…' : trash ? '통합 Inbox로 복원' : '휴지통으로 삭제'}</button><small> 원본 메일 · 프로젝트 자료 유지</small></div>}
        <InboxView {...props} replyContent={draft ? <section aria-label="답신 발송 확인"><h3>답신 발송 확인</h3>{!props.composeBusy && draft.sourceMessageId && draft.sourceMessageId !== visibleMail?.id ? <p role="alert">해당 초안의 원메일을 선택해 주세요.</p> : <Composer key={epoch+'-'+props.composeKey} onBusy={props.onComposeBusy} embedded draft={activeDraft} accounts={data.accounts} isDemo={isDemo} onChange={onDraft} onClose={()=>{onDraft(null);setEpoch(v=>v+1);}} notify={setNotice} onSent={onSent}/>}</section> : undefined} readActive={panel === "read"} acceptReply={acceptReply} mail={visibleMail} newDraft={m=>{props.newDraft(m);setPanel("read");}}/></div>
      {panel === 'brief' && (visibleMail ? <MailSummary key={visibleMail.id+'-'+visibleMail.subject+'-'+visibleMail.body} mail={visibleMail} allowed={!isDemo && visibleMail.owner_id===data.userId && !!data.accounts.find(a=>a.id===visibleMail.account_id)?.ai_enabled && data.aiReady}/> : <p>요약할 메일을 선택해 주세요.</p>)}


    </div>
  </div>;
}
