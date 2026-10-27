"use client";
import { useEffect, useState, useRef } from "react";
import { Download, FileText, Paperclip, Eye, X } from "lucide-react";
import type { AttachmentMeta } from "@/lib/types";
import styles from "./mail-attachments.module.css";
const imageTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const sizeLabel = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.ceil(n / 1024))} KB`;
export default function MailAttachments({ files, demo, notify }: { files: AttachmentMeta[]; demo: boolean; notify: (s: string) => void }) {
  const trigger = useRef<HTMLButtonElement | null>(null);
  const close = () => { setSelected(null); trigger.current?.focus(); };
  const [selected, setSelected] = useState<AttachmentMeta | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setUrl(""); setError("");
    if (!selected) return;
    const controller = new AbortController();

    fetch(`/api/attachment?id=${encodeURIComponent(selected.id)}`, { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error("파일을 불러오지 못했습니다. 다시 시도해 주세요.");
      const blob = await r.blob();
      if (controller.signal.aborted) return;
      const reader = new FileReader();
      reader.onload = () => { if (!controller.signal.aborted) setUrl(String(reader.result)); };
      reader.onerror = () => { if (!controller.signal.aborted) setError("이미지를 읽지 못했습니다."); };
      reader.readAsDataURL(new Blob([blob], { type: selected.type }));
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => { controller.abort(); };
  }, [selected]);
  if (!files.length) return null;
  return <section className={styles.section} aria-label="받은 첨부파일">
    <header className={styles.header}><strong><Paperclip size={18}/> 첨부파일 <span>{files.length}개</span></strong><small>{sizeLabel(files.reduce((sum, f) => sum + f.size, 0))}</small></header>
    <div className={styles.list}>{files.map(f => <article className={styles.card} key={f.id}>
      <FileText size={25} aria-hidden="true"/><div className={styles.info}><strong title={f.name}>{f.name}</strong><small>{f.name.split('.').pop()?.toUpperCase()} · {sizeLabel(f.size)}</small></div>
      <div className={styles.actions}>{imageTypes.has(f.type) && f.size <= 10 * 1048576 && <button type="button" aria-label={`${f.name} 미리보기`} onClick={e => { trigger.current = e.currentTarget; return demo ? notify("샘플 파일입니다. 실제 파일은 포함되지 않습니다.") : selected?.id === f.id ? undefined : (setUrl(""), setError(""), setSelected(f)); }}><Eye size={16}/>미리보기</button>}
      <a href={demo ? "#" : `/api/attachment?id=${encodeURIComponent(f.id)}`} aria-label={`${f.name} 다운로드`} onClick={e => { if (demo) { e.preventDefault(); notify("샘플 파일입니다. 실제 파일은 포함되지 않습니다."); } }}><Download size={16}/>다운로드</a></div>
    </article>)}</div>
    <small className={styles.hint}>이미지는 바로 미리보기 · PDF·견적서·문서는 다운로드 후 열기</small>
    {selected && <div className={styles.preview} onKeyDown={e => { if (e.key === 'Escape') close(); }}>
      <header className={styles.header}><strong>{selected.name}</strong><button type="button" autoFocus onClick={close} aria-label="미리보기 닫기"><X size={18}/>닫기</button></header>
      {error ? <p role="alert">{error}</p> : url ? <img src={url} alt={selected.name} onError={() => setError("이미지를 표시할 수 없습니다. 다운로드해서 확인해 주세요.")}/> : <p role="status">이미지를 불러오는 중…</p>}
    </div>}
  </section>;
}
