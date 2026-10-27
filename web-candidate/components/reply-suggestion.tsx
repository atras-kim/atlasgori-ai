"use client";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Sparkles, Check, ShieldCheck } from "lucide-react";
import { action } from "@/lib/client-api";
import { replyDraft } from "@/lib/reply-policy";
import type { Draft, Message } from "@/lib/types";
import DraftAssistant from './draft-assistant';

type Reply = { body: string; reason: string; checks: string[] };
export type ReplySuggestionHandle = { prepare: () => void };
export default function ReplySuggestion({ mail, isDemo, allowed, accept, notify, prepareRef, autoGenerate = false }: {
  prepareRef?: Ref<ReplySuggestionHandle>; autoGenerate?: boolean;
  mail: Message; isDemo: boolean; allowed: boolean;
  accept: (draft: Draft) => void; notify: (text: string) => void;
}) {
  const [reply, setReply] = useState<Reply | null>(null);
  const [version, setVersion] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const [editedBody,setEditedBody]=useState('');
  const [revising,setRevising]=useState(false);
  const pending=useRef(false);
  const revision=useRef(0);
  const alive = useRef(true);
  const section = useRef<HTMLElement>(null);
  const [requested, setRequested] = useState(0);
  useEffect(() => {
    if (!requested) return;
    const frame = requestAnimationFrame(() => {
      const element = section.current;
      const reader = element?.closest<HTMLElement>('.mail-reading-content');
      if (element && reader) {
        reader.scrollTo({ top: reader.scrollTop + element.getBoundingClientRect().top - reader.getBoundingClientRect().top - 20, behavior: 'smooth' });
      }
      if (!busy) element?.querySelector('textarea')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [requested, busy]);
  useImperativeHandle(prepareRef, () => ({ prepare() {
    setRequested(value => value + 1);
    if (!allowed) { notify('연결 계정에서 외부 AI 처리를 허용한 후 답장 초안을 만들 수 있습니다.'); return; }
    if (!reply) void load();
    else section.current?.querySelector('textarea')?.focus({ preventScroll: true });
  } }));
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(()=>{
    if(!allowed || reply)return;
    if(isDemo){if(autoGenerate)void load();return;}
    let active=true;
    const initialRevision=revision.current;
    action('replySuggestion',{messageId:mail.id,cachedOnly:true}).then(result=>{
      if(active&&revision.current===initialRevision&&!pending.current&&result.reply){setReply(result.reply);setEditedBody(result.reply.body);setVersion(result.version);} else if(active && autoGenerate && !pending.current && revision.current===initialRevision){void load();}
    }).catch(()=>{});
    return()=>{active=false;};
  },[mail.id,allowed,isDemo,autoGenerate]);
  async function load(apply = false) {
    if(pending.current||revising)return;
    pending.current=true;
    revision.current++;
    setBusy(true);
    try {
      if (isDemo) {
        const sample = { body: "안녕하세요. 보내주신 자료 감사합니다.\n\n검토를 위해 견적 유효기간, 최소 주문 수량, 예상 선적 일정과 제품 규격서 및 COA 제공 가능 여부를 알려주시겠습니까?\n\n조건을 확인한 후 회신드리겠습니다. 감사합니다.", reason: "샘플 제안: 거래를 확정하지 않고 비교에 필요한 조건을 확인합니다.", checks: ["실제 원문에 이미 제공된 조건은 질문에서 제외해 주세요.", "수신자와 요청 자료를 확인해 주세요."] };
        if (apply && reply) accept(replyDraft(mail, editedBody)); else {setReply(sample);setEditedBody(sample.body);}
      } else {
        const result = await action("replySuggestion", { messageId: mail.id, accept: apply, expectedVersion: version, expectedBody: apply ? reply?.body : undefined, editedBody: apply ? editedBody : undefined });
        if (!alive.current) return;
        if (apply) { accept(result.draft); notify(`${result.language || '수신 언어'}로 변환했습니다. 아래에서 확인 후 발송해 주세요.`); } else { setReply(result.reply);setEditedBody(result.reply.body); setVersion(result.version); }
      }
    } catch (e) { if (alive.current) notify(e instanceof Error ? e.message : "답신 제안을 불러오지 못했습니다."); }
    finally { pending.current=false;if (alive.current) setBusy(false); }
  }
  return <section ref={section} className="reply-suggestion" aria-label="받은 메일에 대한 AI 답신 초안" aria-busy={busy} style={requested ? {border:'2px solid #2563eb', background:'#eff6ff'} : undefined}>
    <div className="reply-suggestion-heading"><Sparkles size={17}/><b>AI 답신 초안</b><span>{isDemo ? "샘플" : "미발송"}</span></div>
    {!reply ? <><p>수신 시 준비된 초안은 여기에 자동으로 표시됩니다. 아직 초안이 없다면 지금 만들 수 있습니다.</p><button className="button" disabled={busy || !allowed} onClick={()=>load()}>{busy ? "답신을 준비하고 있어요…" : "AI 답신 만들기"}</button>{!allowed && <small>내 메일 계정의 외부 AI 처리를 허용하면 사용할 수 있습니다.</small>}</> : <>
      <p>{reply.reason}</p><label className="reply-body-label">답신 내용 · 직접 수정 가능<textarea aria-label="AI 답신 내용" value={editedBody} maxLength={20000} disabled={busy||revising} onChange={e=>setEditedBody(e.target.value)}/></label>
      <ul>{reply.checks.map((s,i)=><li key={i}>{s}</li>)}</ul>
      {!isDemo&&<DraftAssistant body={editedBody} accountId={mail.account_id} disabled={busy||!allowed} onChange={setEditedBody} onBusy={setRevising} notify={notify}/>}
      <button className="button primary" disabled={busy||revising||!allowed||!editedBody.trim()} onClick={()=>load(true)}><Check size={16}/>{busy ? "수신 언어로 준비 중…" : "이 내용으로 발송 준비"}</button>
      <small><ShieldCheck size={14}/> 수신한 메일의 언어로 변환합니다(AI 사용량 반영). 이 화면 아래에서 번역 내용과 수신자를 확인하고 발송할 수 있습니다.</small>
    </>}
  </section>;
}
