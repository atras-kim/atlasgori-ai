"use client";
import { useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  ExternalLink,
  Globe2,
  Link2,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import Composer from "./composer";
import type { Draft } from "@/lib/types";
import { action } from "@/lib/client-api";
import type {
  Project,
  Provider,
  Visibility,
  WorkspaceData,
  Candidate,
} from "@/lib/types";
type Common = {
  data: WorkspaceData;
  isDemo: boolean;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
};
const visibilities: Visibility[] = [
  "Private",
  "Project Shared",
  "Company",
  "Restricted",
];
const descriptions: Record<Visibility, string> = {
  Private: "프로젝트 소유자만",
  "Project Shared": "소유자와 지정한 프로젝트 멤버",
  Company: "소유자와 같은 회사 멤버",
  Restricted: "소유자와 명시적으로 허용한 멤버",
};
export function Sourcing({
  data,
  isDemo,
  onChange,
  refresh,
  notify,
  initialQuery = "",
}: Common & { onChange: (d: WorkspaceData) => void; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery),
    [results, setResults] = useState<Candidate[]>([]),
    [busy, setBusy] = useState(false),
    [target, setTarget] = useState(data.projects.find(p=>p.owner_id===data.userId)?.id || ""),
    [status, setStatus] = useState("");
  const [chosen,setChosen]=useState<Record<string,Candidate>>({});
  const [emails,setEmails]=useState<Record<string,string>>({});
  const [rfq,setRfq]=useState<Draft|null>(null);
  const [sending,setSending]=useState(false);
  const selected=Object.values(chosen);
  function choose(c:Candidate,checked:boolean){
    if(rfq||sending)return;
    setChosen(previous=>{const next={...previous};if(checked)next[c.url]=c;else delete next[c.url];return next;});
  }
  function prepareRfq(){
    const account=data.accounts[0];
    if(!account){notify('먼저 발신 메일 계정을 연결해 주세요.');return;}
    const recipients=selected.map(c=>(emails[c.url]||'').trim());
    if(!recipients.length||recipients.some(e=>!/^\S+@[^\s@]+\.[^\s@]+$/.test(e)||/[<>,;\r\n]/.test(e))){notify('선택한 모든 업체의 정확한 이메일 주소를 입력해 주세요.');return;}
    const unique=[...new Set(recipients.map(e=>e.toLowerCase()))];
    setRfq({accountId:account.id,to:account.email,cc:'',bcc:unique.join(', '),subject:`견적 요청 · ${query || '제품 공급 문의'}`,body:'안녕하세요, 영업 담당자님.\n\n아래 조건에 대한 견적을 요청드립니다.\n\n제품명: [입력해 주세요]\n규격: [입력해 주세요]\n수량: [입력해 주세요]\n납품 장소 및 희망 일정: [입력해 주세요]\n\n단가, 최소 주문 수량, 납기, 결제 조건 및 견적 유효기간을 알려주시기 바랍니다. 제품 자료도 함께 보내주시면 감사하겠습니다.\n\n감사합니다.\n[보내는 사람 이름 / 회사명]',attachments:[]});
  }
  const pending = useRef(false);
  async function search() {
    if(pending.current||rfq||sending)return;
    if(query.trim().length<3){setStatus("검색어를 3자 이상 입력해 주세요.");return;}
    pending.current=true;
    setBusy(true);
    setResults([]); setChosen({}); setEmails({});
    setStatus("웹에서 공급업체를 찾고 있습니다. 잠시 기다려 주세요.");
    try {
      if (isDemo) {
        setStatus("샘플 화면에서는 검색할 수 없습니다. 로그인 후 이용해 주세요.");
        notify(
          "소싱 검색은 실제 검색 API 연결 후 사용할 수 있습니다. 샘플 업체를 실제 검색 결과로 표시하지 않습니다.",
        );
        return;
      }
      const r = await action("source", { query });
      setResults(r.results);
      setStatus(r.results.length ? `${r.results.length}개 웹 출처를 찾았습니다. 아래에서 확인하고 프로젝트에 추가하세요.` : "검색 결과가 없습니다. 제품명이나 지역을 바꿔 다시 검색해 주세요.");
      window.dispatchEvent(new Event('atlas-ai-usage'));
      notify(
        `${r.results.length}개 웹 검색 결과입니다. 업체와 공급 능력은 아직 검증되지 않았습니다.`,
      );
    } catch (e) {
      setStatus((e as Error).message);
      notify((e as Error).message);
    } finally {
      setBusy(false);
      pending.current=false;
    }
  }
  return (
    <div className="sourcing">
      <section className="surface" style={{padding:20,border:'2px solid #1450e6',marginBottom:18}} aria-label="선택 업체 견적 요청">
        <h2>선택 업체에 견적 요청 <span className="tag">{selected.length}곳</span></h2>
        <p>아래 업체 왼쪽의 체크박스로 선택하세요. 수신 이메일을 확인한 뒤 메일을 작성할 수 있습니다.</p>
        {selected.map(c=><label key={c.url} style={{display:'flex',gap:12,alignItems:'center',marginBottom:10,flexWrap:'wrap'}}><b style={{flex:'1 1 160px'}}>{c.name}</b><input style={{flex:'2 1 220px'}} type="email" aria-label={`${c.name} 견적 요청 이메일`} placeholder="업체 이메일 주소" value={emails[c.url]||''} disabled={!!rfq||sending} onChange={e=>setEmails({...emails,[c.url]:e.target.value})}/></label>)}
        {!rfq && <button className="button primary" disabled={!selected.length||busy||sending} onClick={prepareRfq}>선택한 {selected.length}곳 · 견적 요청 메일 작성</button>}
        {rfq && <><p className="help-text">선택한 업체들은 숨은참조(BCC)에 포함됩니다. 받는 사람은 내 주소이며, 업체 간 이메일 주소는 공개되지 않습니다. 대괄호 항목을 채우고 발송 계정·수신 주소를 확인하세요.</p><Composer embedded draft={rfq} accounts={data.accounts} isDemo={isDemo} onChange={setRfq} onClose={()=>setRfq(null)} onBusy={setSending} notify={notify} onSent={async()=>{setChosen({});setEmails({});await refresh();}}/></>}
      </section>
      <div className="sourcing-intro">
        <span className="sourcing-icon">
          <Globe2 size={30} />
        </span>
        <h2>다음 비즈니스 파트너를 찾아보세요.</h2>
        <p>제품, 지역, 수량 등 원하는 조건을 자연어로 입력하세요.</p>
        <form
          className="sourcing-search"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <Search size={21} />
          <input
            required
            minLength={3}
            maxLength={500}
            disabled={busy || !!rfq || sending}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예: Soybean Oil 업체 100곳 찾아줘"
          />
          <button className="button primary" disabled={busy || !!rfq || sending}>
            {busy ? "검색 중…" : "업체 탐색"}
            <ArrowUpRight size={17} />
          </button>
        </form>
        <p className="help-text">검색어를 외부 검색 서비스에 전달합니다. OpenAI 검색 사용 시 API 크레딧이 사용되며, 검색 도구 비용은 토큰 비용과 별도입니다.</p>
        {status && <p role="status" aria-live="polite">{status}</p>}
        <div className="suggestions">
          {[
            "Soybean Oil 수출업체",
            "한국 PP Resin 제조사",
            "식품 원료 공급업체",
          ].map((s) => (
            <button key={s} disabled={busy || !!rfq || sending} onClick={() => setQuery(s)}>
              {s} <Plus size={13} />
            </button>
          ))}
        </div>
      </div>
      <div className="sourcing-results">
        <div className="section-heading">
          <h2>
            검색 결과 <span className="tag">{results.length}</span>
          </h2>
          <select
            aria-label="소싱 결과 저장할 프로젝트"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">프로젝트 선택</option>
            {data.projects
              .filter((p) => p.owner_id === data.userId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
        <p className="help-text">
          웹 출처를 포함한 후보입니다. 제조사 여부·연락처·공급 조건을 확인해
          주세요. 최대 100개 결과를 요청하되 실제 검색 결과 수는 다를 수
          있습니다.
        </p>
        {results.map((c) => (
          <div className="source-card" key={c.url}><input type="checkbox" aria-label={`${c.name} 견적 요청 선택`} checked={!!chosen[c.url]} disabled={!!rfq||sending} onChange={e=>choose(c,e.target.checked)} style={{width:20,height:20,flexShrink:0,accentColor:"#1450e6"}}/>
            <div>
              <a href={c.url} target="_blank" rel="noopener noreferrer">
                {c.name}
                <ExternalLink size={14} />
              </a>
              <p>{c.description}</p>
              <small>{new URL(c.url).hostname} · 미검증</small>
            </div>
            <button
              className="button"
              disabled={!target}
              onClick={async () => {
                try {
                  await action("saveCandidate", {
                    projectId: target,
                    candidate: c,
                  });
                  await refresh();
                  notify("프로젝트에 소싱 후보를 추가했습니다.");
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              <Plus size={15} />
              프로젝트에 추가
            </button>
          </div>
        ))}
        {!results.length && (
          <div className="empty-state">
            <Search />
            <p>검색하면 출처와 함께 후보 업체가 표시됩니다.</p>
          </div>
        )}
        <h3>프로젝트에 저장된 후보</h3>
        {data.candidates.map((c) => (
          <div className="source-card" key={c.id}><input type="checkbox" aria-label={`${c.name} 견적 요청 선택`} checked={!!chosen[c.url]} disabled={!!rfq||sending} onChange={e=>choose(c,e.target.checked)} style={{width:20,height:20,flexShrink:0,accentColor:"#1450e6"}}/>
            <div>
              <a href={c.url} target="_blank" rel="noopener noreferrer">
                {c.name}
                <ExternalLink size={14} />
              </a>
              <p>{c.description}</p>
              <small>
                {data.projects.find((p) => p.id === c.project_id)?.name} ·
                미검증
              </small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
