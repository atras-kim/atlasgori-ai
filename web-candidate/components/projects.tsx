"use client";
import { useEffect, useState } from "react";
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
import { ProjectBrief } from "./projectbrief";
import Documents from "./documents";
import QuoteComparison from './quote-comparison';
import ProjectMails from './project-mails';
export function Projects({
  data,
  isDemo,
  admin,
  selected,
  onSelect,
  onChange,
  refresh,
  notify,
  run,
}: Common & {
  admin: boolean;
  selected: Project | undefined;
  onSelect: (id: string) => void;
  onChange: (d: WorkspaceData) => void;
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [briefBusy,setBriefBusy]=useState(false),[briefStatus,setBriefStatus]=useState(''),[briefProject,setBriefProject]=useState('');
  async function makeBrief(){
   if(!selected||briefBusy)return;
   setBriefProject(selected.id);setTab('brief');setBriefStatus('프로젝트 메일을 분석하고 있습니다. 잠시 기다려 주세요.');setBriefBusy(true);
   try{if(isDemo)throw Error('샘플에서는 실제 AI 분석을 실행하지 않습니다.');
    await action('brief',{projectId:selected.id});await refresh();setBriefStatus('전체 요약을 저장했습니다.');
   }catch(e){setBriefStatus(e instanceof Error?e.message:'요약 생성에 실패했습니다.');}finally{setBriefBusy(false);}
  }
  const [tab, setTab] = useState<"mails" | "brief" | "documents" | "quotes">("mails");
  const [unassigned, setUnassigned] = useState(false);
  const [projectSearch,setProjectSearch]=useState('');
  useEffect(() => { setUnassigned(false); setTab('mails'); }, [selected?.id]);
  const [creating, setCreating] = useState(false),
    [name, setName] = useState(""),
    [product, setProduct] = useState(""),
    [visibility, setVisibility] = useState<Visibility>("Private"),
    [member, setMember] = useState("");
  async function create() {
    await run(async () => {
      if (!name.trim()) throw new Error("프로젝트명을 입력해 주세요.");
      if (isDemo) {
        const p: Project = {
          id: crypto.randomUUID(),
          name: name.trim(),
          product,
          company: "",
          visibility,
          owner_id: "demo",
          updated_at: new Date().toISOString(),
          brief: null,
        };
        onChange({ ...data, projects: [...data.projects, p] });
        onSelect(p.id);
      } else {
        const r = await action("createProject", { name, product, visibility });
        await refresh();
        onSelect(r.id);
      }
      setCreating(false);
      setName("");
    });
  }
  return (
    <div className="project-layout">
      <div className="project-directory">
        <div className="section-heading">
          <h2>{admin ? "프로젝트별 현황" : "프로젝트 목록"}</h2>
          <button
            className="icon-button"
            aria-label="프로젝트 추가"
            onClick={() => setCreating(!creating)}
          >
            <Plus size={18} />
          </button>
        </div>
        {creating && (
          <div className="inline-form">
            <label>
              프로젝트명
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: Soybean Oil · Korea"
              />
            </label>
            <label>
              제품
              <input
                value={product}
                onChange={(e) => setProduct(e.target.value)}
              />
            </label>
            <label>
              공유 범위
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as Visibility)}
              >
                {visibilities.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <small>{descriptions[visibility]}</small>
            <button className="button primary" onClick={create}>
              프로젝트 만들기
            </button>
          </div>
        )}
        <label className="project-search"><Search size={15}/><input aria-label="프로젝트 검색" placeholder="프로젝트 찾기" value={projectSearch} onChange={e=>setProjectSearch(e.target.value)}/></label>
        {data.projects.filter(p=>`${p.name} ${p.product}`.toLowerCase().includes(projectSearch.toLowerCase())).map((p, i) => (
          <button
            key={p.id}
            className={`project-row ${selected?.id === p.id ? "selected" : ""}`}
            onClick={() => { setUnassigned(false); onSelect(p.id); }}
          >
            <span className={`project-icon color-${i % 3}`}>
              <Globe2 size={22} />
            </span>
            <div>
              <strong title={p.name}>{p.name}</strong>
              <small>
                {p.product || "제품 미지정"} ·{" "}
                {data.messages.filter((m) => m.project_id === p.id).length}개
                대화
              </small>
              <span className="tag">{p.visibility}</span>
            </div>
            <ChevronRight size={16} />
          </button>
        ))}
        {!data.projects.length && (
          <div className="empty-state">첫 프로젝트를 만들어 주세요.</div>
        )}
        {!!data.projects.length && !data.projects.some(p=>`${p.name} ${p.product}`.toLowerCase().includes(projectSearch.toLowerCase())) && <p className="project-search-empty">검색 결과가 없습니다.</p>}
        <button className={`project-row project-unassigned ${unassigned ? "selected" : ""}`} onClick={()=>setUnassigned(true)}><LockKeyhole size={18}/><div><strong>분류 대기함</strong><small>프로젝트 미지정 첨부파일</small></div></button>
        <div className="directory-note">
          <LockKeyhole size={18} />
          <p>
            접근 권한이 있는 프로젝트만 표시됩니다.
          </p>
        </div>
      </div>
      <div className="project-content">
        {unassigned ? <Documents key="unassigned" projectId={null} data={data} isDemo={isDemo} notify={notify} /> : selected ? (
          <>
            <div className="project-heading">
              <div>
                <span className="eyebrow">PROJECT OVERVIEW</span>
                <h2>{selected.name}</h2>
                <p>
                  {selected.product}{" "}
                  <span className="tag">{selected.visibility}</span>
                </p>
              </div>
              <button className="button" disabled={briefBusy||(!isDemo&&selected.owner_id!==data.userId)} onClick={makeBrief}><Sparkles size={16}/>{briefBusy?'전체 요약 생성 중…':'프로젝트 전체 요약 생성'}</button>
            </div>
            {briefStatus&&briefProject===selected.id&&<p role="status">{briefStatus}</p>}
            <p className="document-note">AI 요약 탭: 저장된 요약이 없으면 새로 생성하며 AI 사용량이 차감됩니다.</p><nav className="project-tabs" aria-label="프로젝트 보기"><button aria-pressed={tab==="mails"} onClick={()=>setTab("mails")}>프로젝트 메일</button><button aria-pressed={tab==='brief'} className={tab === "brief" ? "active" : ""} onClick={()=>{setTab("brief");if(!selected.brief&&selected.owner_id===data.userId)void makeBrief();}}>프로젝트 전체 AI 요약</button><button aria-pressed={tab==='documents'} className={tab === "documents" ? "active" : ""} onClick={()=>setTab("documents")}>문서함</button><button aria-pressed={tab==='quotes'} className={tab==='quotes'?'active':''} onClick={()=>setTab('quotes')}>견적 비교</button></nav>
            {tab === "mails" ? (isDemo ? <p>샘플에서는 프로젝트 메일을 통합 Inbox에서 확인하세요.</p> : <ProjectMails key={selected.id} projectId={selected.id}/>) : tab === "brief" ? <ProjectBrief key={`${selected.id}:${selected.brief?.generated_at}`} project={selected} data={data} /> : tab === 'quotes' ? <QuoteComparison key={selected.id} projectId={selected.id} owner={selected.owner_id===data.userId} isDemo={isDemo}/> : <Documents key={selected.id} projectId={selected.id} data={data} isDemo={isDemo} notify={notify} />}
            {selected.owner_id === data.userId && (
              <details className="sharing">
                <summary>
                  <Users size={17} />
                  공유 범위와 멤버 관리
                </summary>
                <label>
                  공유 범위
                  <select
                    value={selected.visibility}
                    onChange={(e) =>
                      run(async () => {
                        const v = e.target.value as Visibility;
                        if (isDemo)
                          onChange({
                            ...data,
                            projects: data.projects.map((p) =>
                              p.id === selected.id
                                ? { ...p, visibility: v }
                                : p,
                            ),
                          });
                        else {
                          await action("updateProject", {
                            projectId: selected.id,
                            visibility: v,
                          });
                          await refresh();
                        }
                      })
                    }
                  >
                    {visibilities.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <p>
                  {descriptions[selected.visibility]}. Company는 서버에 회사
                  소속을 등록한 경우에만 사용할 수 있습니다.
                </p>
                <label>
                  기존 atlasgori 사용자 이메일
                  <input
                    value={member}
                    onChange={(e) => setMember(e.target.value)}
                    placeholder="member@company.com"
                  />
                </label>
                <div className="row">
                  <button
                    className="button"
                    onClick={() =>
                      run(async () => {
                        if (isDemo) {
                          notify("샘플에서는 멤버를 변경하지 않습니다.");
                          return;
                        }
                        await action("projectMember", {
                          projectId: selected.id,
                          email: member,
                          remove: false,
                        });
                        notify("프로젝트 멤버를 추가했습니다.");
                      })
                    }
                  >
                    멤버 추가
                  </button>
                  <button
                    className="button"
                    onClick={() =>
                      run(async () => {
                        if (isDemo) return;
                        await action("projectMember", {
                          projectId: selected.id,
                          email: member,
                          remove: true,
                        });
                        notify("프로젝트 접근 권한을 회수했습니다.");
                      })
                    }
                  >
                    멤버 제거
                  </button>
                </div>
                <small>
                  메일 초대는 발송하지 않습니다. 멤버는 읽기 권한만 갖습니다.
                </small>
              </details>
            )}
          </>
        ) : (
          <div className="empty-state">프로젝트를 선택해 주세요.</div>
        )}
      </div>
    </div>
  );
}


