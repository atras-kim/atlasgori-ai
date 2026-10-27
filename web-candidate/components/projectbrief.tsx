"use client";
import { useState, useEffect } from "react";
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
export function ProjectBrief({
  project,
  data,
}: {
  project: Project;
  data: WorkspaceData;
}) {
  const [language,setLanguage]=useState('original'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [translations,setTranslations]=useState<Record<string,NonNullable<Project['brief']>>>({});
  useEffect(()=>{setTranslations({});setLanguage('original');setError('');},[project.id,project.brief?.generated_at]);
  const b = language==='original'?project.brief:translations[language]||project.brief;
  async function translate(next:string){
   if(next==='original'||translations[next]){setLanguage(next);return;}
   setBusy(true);setError('');
   try{const r=await fetch('/api/brief-language',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:project.id,language:next,consent:true})});const d=await r.json();if(!r.ok)throw Error(d.error||'번역 실패');setTranslations(old=>({...old,[next]:d.brief}));setLanguage(next);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return (
    <div className="brief">
      <div className="brief-title">
        <span>
          <Sparkles size={20} />
          AI Project Brief
        </span>
        <small>
          {b
            ? new Date(b.generated_at).toLocaleString("ko-KR")
            : "아직 생성되지 않음"}
        </small>
      </div>
      {project.brief&&<div style={{padding:'12px 16px'}}><label>요약 언어 <select aria-label="요약 언어" value={language} disabled={busy} onChange={e=>void translate(e.target.value)}><option value="original">원본 보기</option><option value="ko">한국어</option><option value="en">English</option><option value="ja">日本語</option><option value="zh">中文</option><option value="es">Español</option><option value="vi">Tiếng Việt</option></select></label><small> 새 언어 선택 시 요약 내용을 AI로 번역하며 사용량이 차감됩니다. 번역은 이 화면에서만 유지됩니다.</small>{busy&&<p role="status">번역 중…</p>}{error&&<p role="alert">{error}</p>}</div>}
      {b ? (
        <>
          <div className="brief-status">
            <span>CURRENT STATUS</span>
            <h3>{b.status}</h3>
          </div>
          {[
            { key: "quotes" as const, title: "주요 견적" },
            { key: "changes" as const, title: "변경사항" },
            { key: "risks" as const, title: "확인할 리스크" },
            { key: "actions" as const, title: "다음 액션" },
          ].map((s) => (
            <section className={`brief-section ${s.key}`} key={s.key}>
              <h4>{s.title}</h4>
              <ul>
                {b[s.key].map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
              {!b[s.key].length && <p>확인된 정보가 없습니다.</p>}
            </section>
          ))}
          <div className="brief-sources">
            <b>근거 메일</b>
            {b.evidence_ids.map((id) => (
              <p key={id}>
                {data.messages.find((m) => m.id === id)?.subject ||
                  "현재 목록 밖의 메일"}
              </p>
            ))}
            <small>AI 요약입니다. 계약·발송 전 원문을 확인하세요.</small>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <Sparkles />
          <h3>프로젝트의 대화를 요약하세요</h3>
          <p>연결 계정의 AI 처리를 허용한 뒤 요약을 생성할 수 있습니다.</p>
        </div>
      )}
    </div>
  );
}

