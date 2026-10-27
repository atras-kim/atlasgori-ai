import type { MailAccount } from "@/lib/types";
export default function SidebarAccounts({ accounts, onSelect }: { accounts: MailAccount[]; onSelect: (id: string) => void }) {
  return <><div className="nav-section">연결된 이메일 계정</div><div className="sidebar-accounts">{accounts.map(a => <button key={a.id} onClick={() => onSelect(a.id)} title={a.email}><span className={`account-monogram ${a.provider}`}>{a.provider[0].toUpperCase()}</span><span>{a.email}</span></button>)}{!accounts.length && <small>연결된 계정 없음</small>}</div></>;
}
