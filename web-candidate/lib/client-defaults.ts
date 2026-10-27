import type { WorkspaceData } from "./types";
export const empty: WorkspaceData = {
  accounts: [],
  projects: [],
  messages: [],
  candidates: [],
  userId: "",
  email: "",
  aiReady: false,
  searchReady: false,
  gmailReady: false,
};
export const titles: Record<string, string> = {
  inbox: "통합 Inbox",
  projects: "프로젝트",
  sourcing: "공급업체 소싱",
  accounts: "연결 계정",
  admin: "프로젝트 관리",
  members: "회원 · AI 이용 관리",
};
