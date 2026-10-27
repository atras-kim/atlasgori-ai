"use client";
import { useEffect, useState } from "react";
import { Download, FileText, Folder, FolderOpen, Pencil, RefreshCw, X } from "lucide-react";
import { documentLabels, groupDocuments, type DocumentFile, type DocumentFolder, type DocumentKind } from "@/lib/documents";
import type { WorkspaceData } from "@/lib/types";
type Props = { projectId: string | null; data: WorkspaceData; isDemo: boolean; notify: (text: string) => void };
function demoFiles(data: WorkspaceData): DocumentFile[] {
  return data.messages.flatMap(m => m.attachments.map(a => {
    const label = m.sender.match(/@([^>\s]+)/)?.[1] || "";
    const category = a.document_kind || "review";
    return { ...a, message_id: m.id, project_id: m.project_id, owner_id: m.owner_id, sender: m.sender, subject: m.subject, received_at: m.received_at,
      document_kind: category, document_manual: false, company_key: `domain:${label}`, company_label: label, folder_key: category === "brochure" ? `domain:${label}` : "" };
  }));
}
export default function Documents({ projectId, data, isDemo, notify }: Props) {
  const [demoRows, setDemoRows] = useState(() => demoFiles(data));
  const [files, setFiles] = useState<DocumentFile[]>([]), [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [selected, setSelected] = useState<DocumentFolder | null>(null), [page, setPage] = useState(0), [total, setTotal] = useState(0);
  const [version, setVersion] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [edit, setEdit] = useState<DocumentFile | null>(null), [kind, setKind] = useState<DocumentKind>("review"), [company, setCompany] = useState(""), [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setFiles([]); setFolders([]);
    if (isDemo) {
      const all = demoRows.filter(f => f.project_id === projectId);
      const filtered = selected ? all.filter(f => f.document_kind === selected.document_kind && f.folder_key === selected.folder_key) : all;
      setFolders(groupDocuments(all)); setFiles(filtered.slice(page * 50, page * 50 + 50)); setTotal(filtered.length); setLoading(false);
      return () => controller.abort();
    }
    const params = new URLSearchParams({ project: projectId || "unassigned", offset: String(page * 50) });
    if (selected) { params.set("kind", selected.document_kind); params.set("folder", selected.folder_key); }
    fetch(`/api/documents?${params}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "문서함을 불러오지 못했습니다.");
      if (!controller.signal.aborted) { setFiles(body.files); setFolders(body.folders); setTotal(body.total); }
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectId, isDemo, selected, page, version, demoRows]);
  function choose(folder: DocumentFolder | null) { setSelected(folder); setPage(0); }
  async function save() {
    if (!edit) return;
    if (kind === "brochure" && !company.trim()) { notify("브로셔를 보관할 회사명을 입력해 주세요."); return; }
    setSaving(true);
    try {
      if (isDemo) {
        const key = company.trim() ? `manual:${company.trim().toLowerCase()}` : "";
        setDemoRows(rows => rows.map(f => f.id === edit.id ? { ...f, document_kind: kind, company_label: company.trim(), company_key: key, folder_key: kind === "brochure" ? key : "", document_manual: true } : f));
      } else {
        const response = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: edit.id, kind, company }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.error);
      }
      setEdit(null); choose(null); setVersion(v => v + 1); notify(isDemo ? "샘플 파일의 폴더를 변경했습니다. 데모 변경은 저장되지 않습니다." : "파일 분류를 저장했습니다.");
    } catch (e) { notify((e as Error).message); } finally { setSaving(false); }
  }
  return <section className="document-library" aria-label="프로젝트 문서함">
    <header className="document-header"><div><h2><FolderOpen size={22}/> 프로젝트 문서함</h2><p>견적서·계약서는 종류별로, 제품 브로셔는 회사별로 모아 보세요.</p></div><button className="button" disabled={loading} onClick={()=>setVersion(v=>v+1)} aria-label="문서함 새로고침"><RefreshCw size={16}/></button></header>
    <div className="document-note">{isDemo ? "샘플 문서 · 실제 파일 없음. " : "원본 첨부파일을 보관하는 프로젝트 폴더입니다. "}자동 분류는 파일명 기준이며 PDF 내용은 분석하지 않습니다. 회사 폴더는 발신자 기준이므로 실제 회사명을 확인해 주세요.</div>
    <div className="document-layout"><nav className="document-folders" aria-label="문서 폴더">
      <button className={!selected ? "active" : ""} onClick={()=>choose(null)}><Folder size={17}/>전체 문서<span>{folders.reduce((n,f)=>n+Number(f.file_count),0)}</span></button>
      {(["quote","brochure","contract","review"] as DocumentKind[]).map(category=><div key={category}><h3>{documentLabels[category]}</h3>{folders.filter(f=>f.document_kind===category).map(f=><button key={JSON.stringify([f.document_kind,f.folder_key])} className={selected?.document_kind===f.document_kind && selected.folder_key===f.folder_key ? "active" : ""} onClick={()=>choose(f)}><Folder size={16}/><span className="folder-name">{category === "brochure" ? f.company_label : documentLabels[category]}</span><span>{f.file_count}</span></button>)}{!folders.some(f=>f.document_kind===category) && <small>파일 수신 시 자동 생성</small>}</div>)}
    </nav><div className="document-files"><div className="document-path"><FolderOpen size={16}/> {selected ? `${documentLabels[selected.document_kind]}${selected.company_label ? ` / ${selected.company_label}` : ""}` : "전체 문서"}</div>
      {loading ? <p className="empty-state">문서를 불러오는 중입니다…</p> : error ? <p role="alert" className="empty-state">{error}</p> : !files.length ? <p className="empty-state">아직 파일이 없습니다. 첨부 메일이 이 프로젝트에 분류되면 자동으로 나타납니다.</p> : files.map(f=><article className="document-file" key={f.id}><FileText size={24}/><div><strong>{f.name}</strong><div className="document-badges"><span className="tag">{documentLabels[f.document_kind]}</span><small>{f.document_manual ? "직접 분류" : "파일명 자동 분류"} · {Math.ceil(f.size/1024)} KB</small></div><small>{f.company_label || "회사 확인 필요"} · {new Date(f.received_at).toLocaleDateString("ko-KR")}</small><details><summary>원본 메일 정보</summary><p>{f.subject}</p><p>{f.sender}</p></details></div><div className="document-file-actions"><button className="button" aria-label={`${f.name} 다운로드`} onClick={()=>isDemo ? notify("샘플 문서입니다. 실제 파일은 포함되지 않습니다.") : window.open(`/api/attachment?id=${encodeURIComponent(f.id)}`,"_blank","noopener,noreferrer")}><Download size={16}/></button>{f.owner_id===data.userId && <button className="button" aria-label={`${f.name} 분류 수정`} onClick={()=>{setEdit(f);setKind(f.document_kind);setCompany(f.company_label);}}><Pencil size={16}/></button>}</div></article>)}
      {!loading && !error && total>0 && <div className="document-pagination"><button className="button" disabled={page===0} onClick={()=>setPage(p=>p-1)}>이전</button><small>{page*50+1}–{Math.min((page+1)*50,total)} / {total}개</small><button className="button" disabled={(page+1)*50>=total} onClick={()=>setPage(p=>p+1)}>다음</button></div>}
    </div></div>
    {edit && <div className="document-edit"><div className="section-heading"><h3>파일 분류 수정</h3><button disabled={saving} aria-label="분류 수정 닫기" onClick={()=>setEdit(null)}><X size={18}/></button></div><p>{edit.name}</p><label>문서 종류<select value={kind} disabled={saving} onChange={e=>setKind(e.target.value as DocumentKind)}>{Object.entries(documentLabels).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></label><label>회사명<input value={company} maxLength={160} disabled={saving} onChange={e=>setCompany(e.target.value)} placeholder="예: Atlas Foods"/></label><small>같은 회사명으로 지정한 브로셔는 같은 폴더에 모입니다. 원본 파일은 변경하지 않습니다.</small><button className="button primary" disabled={saving} onClick={save}>{saving ? "저장 중…" : "분류 저장"}</button></div>}
  </section>;
}
