"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Paperclip,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import type { Draft, MailAccount } from "@/lib/types";
import { action } from "@/lib/client-api";
import DraftAssistant from './draft-assistant';
import SaveDraft from './save-draft';
export default function Composer({
  draft,
  accounts,
  isDemo,
  onClose,
  onChange,
  notify,
  onSent,
  embedded = false,
  onBusy,
}: {
  draft: Draft;
  accounts: MailAccount[];
  isDemo: boolean;
  onClose: () => void;
  onChange: (d: Draft) => void;
  notify: (s: string) => void;
  onSent: () => Promise<void>;
  embedded?: boolean;
  onBusy?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [intent, setIntent] = useState<string | null>(null),
    [approved, setApproved] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [uploading, setUploading] = useState(false);
  const mounted = useRef(true);
  const adding=useRef(false);
  const [dragging,setDragging]=useState(false);
  const dragDepth=useRef(0);
  const latestDraft=useRef(draft);latestDraft.current=draft;
  async function addFiles(files:File[]){
    if(!files.length)return;
    if(busy||uploading||adding.current||intent||uncertain){notify('현재 처리를 완료하거나 최종 확인에서 수정 버튼을 누른 후 첨부해 주세요.');return;}
    if(files.length+draft.attachments.length>10){notify('첨부파일은 최대 10개까지 가능합니다.');return;}
    if(files.reduce((n,f)=>n+f.size,0)+draft.attachments.reduce((n,a)=>n+a.content.length*0.75,0)>10*1024*1024){notify('첨부파일은 합계 10 MB까지 가능합니다.');return;}
    adding.current=true;setUploading(true);
    try{
      const added=await Promise.all(files.map(f=>new Promise<{name:string;type:string;content:string}>((resolve,reject)=>{
        const reader=new FileReader();reader.onload=()=>resolve({name:f.name,type:f.type||'application/octet-stream',content:String(reader.result).split(',')[1]||''});reader.onerror=()=>reject(Error('read'));reader.onabort=()=>reject(Error('abort'));reader.readAsDataURL(f);
      })));
      if(mounted.current){onChange({...latestDraft.current,attachments:[...latestDraft.current.attachments,...added]});setIntent(null);setApproved(false);notify(added.length+'개 파일을 첨부했습니다.');}
    }catch{if(mounted.current)notify('첨부파일을 읽지 못했습니다. 파일을 다시 선택해 주세요.');}
    finally{adding.current=false;if(mounted.current)setUploading(false);}
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onBusy?.(busy || uploading); return () => onBusy?.(false); }, [busy, uploading, onBusy]);
  function edit(p: Partial<Draft>) {
    onChange({ ...draft, ...p });
    setIntent(null);
    setApproved(false);
  }
  async function prepare() {
    setBusy(true);
    try {
      if (!draft.to || !draft.subject || !draft.accountId)
        throw new Error("발신 계정, 받는 사람, 제목을 입력해 주세요.");
      if (isDemo) setIntent("demo");
      else {
        const r = await action("prepareSend", { draft });
        if (!mounted.current) return;
        onChange({...r.draft, sourceMessageId: draft.sourceMessageId, savedId: draft.savedId, savedVersion: draft.savedVersion});
        setIntent(r.intentId);
      }
    } catch (e) {
      if (mounted.current) notify((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function send() {
    setBusy(true);
    try {
      if (isDemo) {
        notify(
          "샘플 발송 확인을 완료했습니다. 실제 메일은 발송되지 않았습니다.",
        );
        onClose();
        return;
      }
      const r = await action("confirmSend", {
        intentId: intent,
        approved: true,
      });
      if (!mounted.current) return;
      if (r.status === "uncertain") {
        setUncertain(true);
        setIntent(null);
        notify(
          "발송 결과 확인이 필요합니다. 해당 계정의 보낸 메일함을 확인하고, 재발송하지 마세요.",
        );
        return;
      }
      notify("메일 서버가 발송 요청을 접수했습니다.");
      onClose();
      await onSent();
    } catch (e) {
      if (!mounted.current) return;
      setUncertain(true);
      setIntent(null);
      notify(
        `${(e as Error).message} 발송을 다시 시도하기 전에 보낸 메일함을 확인해 주세요.`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {!embedded && <div
        className="panel-shade"
        onClick={() => {
          if (!busy && !uploading) onClose();
        }}
      />}
      <aside
        className={`composer ${embedded ? "embedded-composer" : ""}`}
        role={embedded ? "region" : "dialog"}
        aria-modal={embedded ? undefined : true}
        aria-label="메일 작성"
        onDragEnter={e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();dragDepth.current++;setDragging(true);}}
        onDragOver={e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();e.dataTransfer.dropEffect=busy||uploading||intent||uncertain?'none':'copy';}}
        onDragLeave={e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();dragDepth.current=Math.max(0,dragDepth.current-1);if(!dragDepth.current)setDragging(false);}}
        onDrop={e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();e.stopPropagation();dragDepth.current=0;setDragging(false);if(Array.from(e.dataTransfer.items).some(i=>i.webkitGetAsEntry?.()?.isDirectory)){notify('폴더 대신 폴더 안의 파일을 선택해서 끌어 놓아 주세요.');return;}void addFiles(Array.from(e.dataTransfer.files));}}
        style={dragging?{outline:'3px solid #2563eb',outlineOffset:-3,background:'#eff6ff'}:undefined}
      >
        <div className="panel-title">
          <div>
            <span className="eyebrow">COMPOSE</span>
            <h2>{intent ? "발송 전 최종 확인" : "메일 내용 작성"}</h2>
          </div>
          <button
            onClick={onClose}
            disabled={busy || uploading}
            aria-label="작성창 닫기"
          >
            <X />
          </button>
        </div>
        <div className="composer-body">
          <label>
            보내는 계정
            <select
              value={draft.accountId}
              disabled={!!intent || uncertain || busy || uploading}
              onChange={(e) => edit({ accountId: e.target.value })}
            >
              <option value="">계정 선택</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            받는 사람
            <input
              value={draft.to}
              disabled={!!intent || uncertain || busy || uploading}
              placeholder="name@company.com"
              onChange={(e) => edit({ to: e.target.value })}
            />
          </label>
          <div className="field-pair">
            <label>
              참조
              <input
                value={draft.cc}
                disabled={!!intent || uncertain || busy || uploading}
                onChange={(e) => edit({ cc: e.target.value })}
              />
            </label>
            <label>
              숨은 참조
              <input
                value={draft.bcc}
                disabled={!!intent || uncertain || busy || uploading}
                onChange={(e) => edit({ bcc: e.target.value })}
              />
            </label>
          </div>
          <label>
            제목
            <input
              value={draft.subject}
              disabled={!!intent || uncertain || busy || uploading}
              placeholder="메일 제목"
              onChange={(e) => edit({ subject: e.target.value })}
            />
          </label>
          <label className="body-label">
            내용
            <textarea
              value={draft.body}
              disabled={!!intent || uncertain || busy || uploading}
              placeholder="전달할 내용을 작성하세요…"
              onChange={(e) => edit({ body: e.target.value })}
            />
          </label>
          {!intent && !uncertain && !isDemo && <DraftAssistant body={draft.body} accountId={draft.accountId} disabled={busy || uploading}
            onChange={body => edit({ body })} onBusy={setBusy} notify={notify} />}
          {!intent && !uncertain && !isDemo && <SaveDraft draft={draft} disabled={busy || uploading} onChange={onChange} onBusy={setBusy} notify={notify} />}
          <p role="status">{uploading ? "파일을 첨부하고 있습니다…" : dragging ? "파일을 놓으면 첨부됩니다." : "바탕화면이나 폴더의 파일을 이 작성창으로 끌어 놓으세요."}</p>
          <div className="attachments">
            {draft.attachments.map((a, i) => (
              <div className="attachment" key={i}>
                <Paperclip size={15} />
                {a.name}
                {!intent && !uncertain && (
                  <button
                    aria-label={`${a.name} 제거`}
                    disabled={busy || uploading}
                    onClick={() =>
                      edit({
                        attachments: draft.attachments.filter(
                          (_, j) => i !== j,
                        ),
                      })
                    }
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {!intent && !uncertain && (
            <label className="file-picker" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,width:'100%',minHeight:132,padding:'22px 16px',boxSizing:'border-box',border:dragging?'3px solid #1d4ed8':'2px dashed #3b82f6',borderRadius:14,background:dragging?'#dbeafe':'#eff6ff',color:'#1746a2',cursor:busy||uploading?'not-allowed':'pointer',textAlign:'center',transition:'background 150ms, border-color 150ms'}}>
              <Paperclip size={26} />
              <strong style={{fontSize:16}}>파일을 이곳에 끌어 놓으세요</strong>
              <span style={{fontSize:13,color:'#47658c'}}>클릭해서 파일 선택 · 최대 10개 · 합계 10 MB</span>
              <input
                type="file"
                multiple
                disabled={busy || uploading}
                onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void addFiles(files);}}
              />
            </label>
          )}
          {intent && (
            <div className="approval">
              <ShieldCheck size={20} />
              <p>
                <b>{accounts.find((a) => a.id === draft.accountId)?.email}</b>{" "}
                계정으로 위 수신자·제목·본문·첨부파일을 보냅니다. 승인 후 내용은
                변경할 수 없습니다.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(e) => setApproved(e.target.checked)}
                />
                위 내용을 확인하고 이번 발송을 승인합니다.
              </label>
            </div>
          )}
          {uncertain && (
            <div className="approval">
              <b>발송 결과 확인 필요</b>
              <p>
                중복 발송을 막기 위해 자동 재시도하지 않습니다. 원래 메일
                서비스의 보낸 메일함을 확인해 주세요.
              </p>
            </div>
          )}
        </div>
        <div className="composer-footer">
          <small>
            {isDemo
              ? "데모 · 실제 발송 안 함"
              : `발신: ${accounts.find((a) => a.id === draft.accountId)?.email || "미선택"}`}
          </small>
          {intent ? (
            <>
              <button
                className="button"
                disabled={busy}
                onClick={() => {
                  setIntent(null);
                  setApproved(false);
                }}
              >
                수정
              </button>
              <button
                className="button primary"
                disabled={!approved || busy}
                onClick={send}
              >
                <Send size={16} />
                {isDemo ? "샘플 확인" : "승인하고 발송"}
              </button>
            </>
          ) : (
            <button
              className="button primary"
              disabled={busy || uploading || uncertain || !accounts.length}
              onClick={prepare}
            >
              보내기 · 최종 확인 <ArrowUpRight size={16} />
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

