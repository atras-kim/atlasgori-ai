export type DocumentKind = "quote" | "brochure" | "contract" | "review";
export type DocumentFile = {
  id: string; message_id: string; name: string; size: number; type: string;
  document_kind: DocumentKind; company_key: string; company_label: string;
  document_manual: boolean; folder_key: string; project_id: string | null;
  owner_id: string; sender: string; subject: string; received_at: string;
};
export type DocumentFolder = { document_kind: DocumentKind; folder_key: string; company_label: string; file_count: number };
export const documentLabels: Record<DocumentKind, string> = { quote: "견적서", brochure: "제품 브로셔", contract: "계약서", review: "분류 확인 필요" };
export function groupDocuments(files: DocumentFile[]): DocumentFolder[] {
  const folders = new Map<string, DocumentFolder>();
  for (const f of files) {
    const key = JSON.stringify([f.document_kind, f.folder_key]);
    const folder = folders.get(key) || { document_kind: f.document_kind, folder_key: f.folder_key, company_label: f.document_kind === "brochure" ? f.company_label : "", file_count: 0 };
    folder.file_count++; folders.set(key, folder);
  }
  return [...folders.values()];
}
