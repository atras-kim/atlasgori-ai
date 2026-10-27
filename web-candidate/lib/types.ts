export type Visibility =
  "Private" | "Project Shared" | "Company" | "Restricted";
export type Provider = "gmail" | "naver" | "daum" | "yahoo" | "outlook" | "custom";
export type MailAccount = {
  id: string;
  email: string;
  provider: Provider;
  last_synced_at: string | null;
  ai_enabled: boolean;
  automation_enabled?: boolean;
  backfill_cursor?: string | null;
};
export type Brief = {
  status: string;
  quotes: string[];
  changes: string[];
  risks: string[];
  actions: string[];
  evidence_ids: string[];
  generated_at: string;
};
export type Project = {
  id: string;
  name: string;
  product: string;
  company: string;
  visibility: Visibility;
  owner_id: string;
  company_id?: string | null;
  brief: Brief | null;
  updated_at: string;
};
export type Message = {
  inbox_trashed_at?: string | null;
  id: string;
  account_id: string;
  owner_id: string;
  provider_id: string;
  subject: string;
  sender: string;
  to: string[];
  body: string;
  received_at: string;
  unread: boolean;
  project_id: string | null;
  product?: string | null;
  company?: string | null;
  attachments: AttachmentMeta[];
};
export type AttachmentMeta = {
  id: string;
  name: string;
  size: number;
  type: string;
  extraction?: string;
  document_kind?: "quote" | "brochure" | "contract" | "review";
};
export type Candidate = {
  id: string;
  name: string;
  url: string;
  description: string;
  project_id?: string | null;
};
export type OutgoingAttachment = {
  name: string;
  type: string;
  content: string;
};
export type Draft = {
  sourceMessageId?: string;
  savedId?: string;
  savedVersion?: number;
  accountId: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  attachments: OutgoingAttachment[];
};
export type WorkspaceData = {
  accounts: MailAccount[];
  messages: Message[];
  projects: Project[];
  candidates: Candidate[];
  userId: string;
  email: string;
  aiReady: boolean;
  aiProvider?: string;
  searchReady: boolean;
  isOperator?: boolean;
  gmailReady: boolean;
};
