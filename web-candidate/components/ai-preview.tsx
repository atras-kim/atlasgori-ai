"use client";
import { useRef, useState } from "react";
import type { WorkspaceData, Draft, Message } from "@/lib/types";
import SavedWork, {savedRequest} from './saved-work';
import OrganizeAnalysis from './organize-analysis';
import { previewDraft } from '@/lib/preview-drafts';
import type { PreviewResult } from "@/lib/ai-preview";
export default function AiPreview({ data, onCompose }: { data: WorkspaceData; onCompose: (draft: Draft) => void }) {
  const [ids, setIds] = useState<string[]>([]), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [result, setResult] = useState<PreviewResult | null>(null);
  const pending = useRef(false);
  const [sources,setSources]=useState<Message[]>([]);
  const [saved,setSaved]=useState<{id:string;version:number}|null>(null);
  async function saveAnalysis(value:PreviewResult, previous=saved) {
    const record=await savedRequest('/api/saved-work',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'analysis',id:previous?.id,version:previous?.version,value})});
    setSaved(record);window.dispatchEvent(new Event('atlas-saved-work'));
  }
  const ready = data.aiReady && data.aiProvider === "openai";
  function compose(item: PreviewResult['items'][number], mode: 'reply'|'analysis') {
    try {
      const message = [...data.messages,...sources].find(m => m.id === item.id && m.owner_id === data.userId);
      if (!message) throw new Error('원메일을 찾을 수 없습니다.');
      const sender = data.accounts.find(a => a.email === 'mmm_ceo@naver.com')?.id || message.account_id;
      onCompose(previewDraft(message, item, mode, sender));
    } catch (error) { setNotice(error instanceof Error ? error.message : '작성창을 열지 못했습니다.'); }
  }
  async function preview() {
    if (pending.current || !consent || !ids.length) return;
    pending.current = true; setBusy(true); setSaved(null); setResult(null); setNotice("선택한 메일을 분석하고 있습니다…");
    try {
      const response = await fetch("/api/ai-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageIds: ids, consent }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "분석하지 못했습니다.");
      setResult(body); setSources(data.messages);
      try {await saveAnalysis(body,null);setNotice('분석 완료 · 본인 전용으로 저장했습니다. 메일은 발송하지 않았습니다.');}
      catch {setNotice('분석은 완료했지만 저장하지 못했습니다. 아래 결과 저장을 눌러 다시 저장해 주세요. AI 분석은 반복하지 않습니다.');}
    } catch (error) { setNotice(error instanceof Error ? error.message : "분석하지 못했습니다."); }
    finally { pending.current = false; setBusy(false); setConsent(false); window.dispatchEvent(new Event('atlas-ai-usage')); }
  }
  return <section className="surface" style={{ gridColumn: "1 / -1" }}>
    <div className="section-heading"><h2>OpenAI 메일 분석 시험</h2><span className="tag">최대 3건</span></div>
    <p>선택한 메일의 제목·발신자·본문(최대 10,000자)을 OpenAI로 전달합니다. 첨부파일은 제외합니다. API 사용료가 발생할 수 있습니다.</p>
    <p className="help-text">선택한 메일만 분석하며 결과는 본인 전용으로 저장합니다. 자동 분류·메일 발송은 실행하지 않습니다.</p>
    <SavedWork kind="analysis" onOpen={entry=>{if(pending.current)return;setResult({items:entry.value.items});setSources(entry.value.messages);setSaved({id:entry.id,version:entry.version});setNotice('저장된 분석을 열었습니다. 추가 AI 사용료는 발생하지 않습니다.');}} />
    <div style={{ maxHeight: 240, overflowY: "auto", margin: "16px 0" }}>
      {data.messages.filter(m => m.owner_id === data.userId).map(m => <label className="check-label" key={m.id} style={{ display: "flex", marginBottom: 12 }}>
        <input type="checkbox" checked={ids.includes(m.id)} disabled={busy || (!ids.includes(m.id) && ids.length >= 3)} onChange={e => {
          setIds(previous => e.target.checked ? [...previous, m.id] : previous.filter(id => id !== m.id)); setConsent(false); setResult(null);
        }} /><span><b>{m.subject}</b><small style={{ display: "block" }}>{m.sender}</small></span>
      </label>)}
    </div>
    <label className="check-label"><input type="checkbox" checked={consent} disabled={busy || !ready || !ids.length} onChange={e => setConsent(e.target.checked)} />선택한 {ids.length}건을 OpenAI에 전달하여 이번 분석을 실행하는 데 동의합니다.</label>
    <button className="button primary" disabled={!ready || !consent || busy || !ids.length} onClick={preview}>{busy ? "분석 중…" : `선택한 ${ids.length}건 분석`}</button>
    <p role="status">{notice || (!ready ? "OpenAI 연결 설정이 필요합니다." : "메일을 선택해 주세요.")}</p>
    {result && <button className="button" disabled={busy||!!saved} onClick={async()=>{if(pending.current)return;pending.current=true;setBusy(true);try{await saveAnalysis(result);setNotice('분석 결과를 저장했습니다.');}catch(error){setNotice((error as Error).message);}finally{pending.current=false;setBusy(false);}}}>{saved?'분석 저장 완료':'결과 저장 · AI 재호출 없음'}</button>}
    {result?.items.map(item => <article key={item.id} style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16, marginTop: 16 }}>
      <h3>{[...data.messages,...sources].find(m => m.id === item.id)?.subject}</h3>
      <p>제품: {item.product} · 회사: {item.company} · 프로젝트 제안: {item.project}</p>
      <p style={{ whiteSpace: "pre-wrap" }}>{item.summary}</p>
      <p>리스크: {item.risks.join(" / ") || "확인된 내용 없음"}</p><p>다음 액션: {item.actions.join(" / ") || "확인된 내용 없음"}</p>
      {item.reply && <><h4>답신 제안 · 미발송</h4><p style={{ whiteSpace: "pre-wrap" }}>{item.reply.body}</p><p>{item.reply.reason}</p><p>확인할 사항: {item.reply.checks.join(" / ")}</p></>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {item.reply && <button className="button primary" onClick={() => compose(item, 'reply')}>답신 편집 · 보내기</button>}
        <button className="button" onClick={() => compose(item, 'analysis')}>분석 결과 메일로 공유</button>
      </div>
      <p className="help-text">작성창에서 직접 편집하거나 AI에 수정을 요청할 수 있습니다. 최종 확인 후 발송합니다.</p>
      {saved && <OrganizeAnalysis key={`${saved.id}:${item.id}`} savedId={saved.id} messageId={item.id} suggestedName={item.project}/>}
    </article>)}
  </section>;
}
