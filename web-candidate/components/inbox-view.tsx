"use client";
import { useRef, type ReactNode } from 'react';
import {
  Inbox,
  Search,
  BriefcaseBusiness,
  Paperclip,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import type { WorkspaceData, Message, Draft } from "@/lib/types";
import ReplySuggestion, { type ReplySuggestionHandle } from "./reply-suggestion";
import MailAttachments from "./mail-attachments";
import MailTranslation from './mail-translation';
export type InboxProps = {
  readActive?: boolean;
  replyContent?: ReactNode;
  acceptReply?: (draft: Draft) => void;
  data: WorkspaceData;
  account: string;
  setAccount: (v: string) => void;
  query: string;
  setQuery: (v: string) => void;
  filtered: Message[];
  mail: Message | undefined;
  setSelected: (v: string) => void;
  busy: boolean;
  isDemo: boolean;
  assign: (m: Message, id: string) => Promise<void>;
  setNotice: (s: string) => void;
  newDraft: (m?: Message) => void;
  setProject: (s: string) => void;
  setView: (s: string) => void;
};
export default function InboxView({
  readActive=true,
  replyContent,
  acceptReply,
  data,
  account,
  setAccount,
  query,
  setQuery,
  filtered,
  mail,
  setSelected,
  busy,
  isDemo,
  assign,
  setNotice,
  newDraft,
  setProject,
  setView,
}: InboxProps) {
  const replySuggestion = useRef<ReplySuggestionHandle>(null);
  const canPrepareAiReply = isDemo || (!!mail && mail.owner_id === data.userId && !!data.accounts.find(a=>a.id===mail.account_id)?.ai_enabled && data.aiReady);
  return (
    <>
      <div className="inbox-toolbar">
        <div className="tabs">
          <button className="selected" onClick={() => setAccount("all")}>
            전체 메일 <span>{data.messages.length}</span>
          </button>
          <select
            aria-label="메일 계정 필터"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          >
            <option value="all">모든 계정</option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}
              </option>
            ))}
          </select>
        </div>
        <label className="search">
          <Search size={17} />
          <input
            placeholder="메일, 업체, 제품 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <div className="inbox-grid">
        <div className="mail-list">
          <div className="list-label">
            CONVERSATIONS <span>{filtered.length}</span>
          </div>
          {filtered.map((m) => (
            <button
              key={m.id}
              className={`mail-card ${mail?.id === m.id ? "selected" : ""}`}
              onClick={() => setSelected(m.id)}
            >
              <div className="mail-card-top">
                <strong>{m.sender.split("<")[0]}</strong>
                <span>
                  {new Date(m.received_at).toLocaleDateString("ko-KR", {
                    month: "numeric",
                    day: "numeric",
                  })}
                </span>
              </div>
              <h3>
                {m.unread && <span className="unread-dot" />}
                {m.subject}
              </h3>
              <p>{m.body.slice(0, 80)}</p>
              <div className="mail-tags">
                {m.attachments.length > 0 && <span className="tag"><Paperclip size={13}/> 첨부 {m.attachments.length}</span>}
                <span className="account-tag">
                  {data.accounts.find((a) => a.id === m.account_id)?.email ||
                    "공유 메일"}
                </span>
                {m.project_id && (
                  <span className="tag">
                    {data.projects.find((p) => p.id === m.project_id)?.product}
                  </span>
                )}
              </div>
            </button>
          ))}
          {!filtered.length && (
            <div className="empty-state">
              <Inbox />
              <h3>표시할 메일이 없습니다</h3>
              <p>계정을 연결하고 동기화하거나 검색 조건을 바꿔 주세요.</p>
            </div>
          )}
        </div>
        <article className="mail-detail">
          {mail ? (
            <>
              <div className="mail-reading-content" tabIndex={0} aria-label="메일 본문">
              <div className="detail-meta">
                <span className="tag">
                  {mail.project_id
                    ? data.projects.find((p) => p.id === mail.project_id)
                        ?.visibility
                    : "Private"}
                </span>
                <span>
                  {new Date(mail.received_at).toLocaleString("ko-KR")}
                </span>
              </div>
              <h2>{mail.subject}</h2>
              <div className="sender-row">
                <span className="avatar amber">{mail.sender[0]}</span>
                <div>
                  <strong>{mail.sender}</strong>
                  <small>받는 사람: {mail.to.join(", ")}</small>
                </div>
              </div>
              <div className="classification">
                <BriefcaseBusiness size={17} />
                <span>프로젝트</span>
                <select
                  aria-label="프로젝트 분류"
                  value={mail.project_id || ""}
                  disabled={busy || (!isDemo && mail.owner_id !== data.userId)}
                  onChange={(e) => assign(mail, e.target.value)}
                >
                  <option value="">미분류</option>
                  {data.projects
                    .filter((p) => p.owner_id === data.userId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.visibility}
                      </option>
                    ))}
                </select>
              </div>
              <MailAttachments key={mail.id} files={mail.attachments} demo={isDemo} notify={setNotice}/>
              <div className="mail-body">{mail.body}</div>
              <MailTranslation key={`${mail.id}-${mail.body}`} id={mail.id} active={readActive} allowed={!isDemo && canPrepareAiReply}/>
              {replyContent || (acceptReply && <ReplySuggestion autoGenerate={readActive} prepareRef={replySuggestion} key={`${mail.id}-${mail.subject}-${mail.body}`} mail={mail} isDemo={isDemo} allowed={isDemo || (mail.owner_id === data.userId && !!data.accounts.find(a=>a.id===mail.account_id)?.ai_enabled && data.aiReady)} accept={acceptReply} notify={setNotice}/>)}
 
              </div><div className="reply-bar">
                {!replyContent && <button className="button" onClick={() => acceptReply && canPrepareAiReply ? replySuggestion.current?.prepare() : newDraft(mail)}>
                  답장 작성 <ArrowUpRight size={15} />
                </button>}
                {mail.project_id && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setProject(mail.project_id!);
                      setView("projects");
                    }}
                  >
                    프로젝트 Brief 보기 <Sparkles size={15} />
                  </button>
                )}
              </div>
            </>
          ) : (
            replyContent || <div className="empty-state">메일을 선택해 주세요.</div>
          )}
        </article>
      </div>
    </>
  );
}
