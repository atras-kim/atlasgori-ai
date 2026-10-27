"use client";
import { useEffect, useRef, useState } from 'react';
export default function DraftAssistant({ body, accountId, disabled, onChange, onBusy, notify }: {
  body: string; accountId: string; disabled: boolean;
  onChange: (body: string) => void; onBusy: (busy: boolean) => void; notify: (text: string) => void;
}) {
  const [instruction, setInstruction] = useState('');
  const [consent, setConsent] = useState(false), [working, setWorking] = useState(false);
  const [previous, setPrevious] = useState<{before: string; after: string} | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function revise() {
    if (pending.current || disabled || !consent || !body.trim() || !instruction.trim() || !accountId) return;
    pending.current = true; setWorking(true); onBusy(true);
    try {
      const response = await fetch('/api/draft-revision', { method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ accountId, body, instruction, consent }) });
      const result = await response.json();
      if (!mounted.current) return;
      if (!response.ok) throw new Error(result.error || '수정하지 못했습니다.');
      if (typeof result.body !== 'string' || !result.body.trim()) throw new Error('수정된 내용을 확인하지 못했습니다.');
      setPrevious({ before: body, after: result.body }); onChange(result.body); setInstruction('');
      notify('요청을 반영했습니다. 수정된 내용을 확인한 후 보내주세요.');
    } catch (error) { if (mounted.current) notify(error instanceof Error ? error.message : '수정하지 못했습니다. 기존 초안은 유지됩니다.'); }
    finally { pending.current = false; if (mounted.current) { setWorking(false); onBusy(false); setConsent(false); } window.dispatchEvent(new Event('atlas-ai-usage')); }
  }
  return <section className="approval draft-assistant" aria-label="AI 초안 수정">
    <button type="button" className="button" disabled={disabled || working} onClick={()=>{setInstruction('의미, 이름, 금액과 조건은 그대로 유지하고, 자연스럽고 정중한 비즈니스 답신으로 다듬어 주세요. 반복 표현과 불필요한 문장은 줄이고 문단을 읽기 좋게 나눠 주세요.');setConsent(false);}}>자연스럽게 다듬기</button>
    <label className="draft-instruction">추가하거나 변경할 내용<textarea rows={5} value={instruction} maxLength={2000} disabled={disabled || working}
      placeholder="예: 좀 더 정중하게 써줘. 샘플 3개를 요청하고 납기도 확인해 줘."
      onChange={e => { setInstruction(e.target.value); setConsent(false); }} /></label>
    <small>현재 본문과 수정 요청만 OpenAI로 전달합니다. 첨부파일은 제외하며 AI 사용량에 합산됩니다.</small>
    <label><input type="checkbox" checked={consent} disabled={disabled || working} onChange={e => setConsent(e.target.checked)} />이번 초안 수정의 OpenAI 전송에 동의합니다.</label>
    <button type="button" className="button primary" disabled={disabled || working || !consent || !body.trim() || !instruction.trim() || !accountId} onClick={revise}>{working ? '수정 중…' : '수정하기'}</button>
    {previous && <button type="button" className="button" disabled={disabled || working || body !== previous.after} onClick={() => { onChange(previous.before); setPrevious(null); }}>수정 전으로 되돌리기</button>}
  </section>;
}
