"use client";
import { useRef, useState } from "react";
import AiPreview from "./ai-preview";
import AiUsage from "./ai-usage";
import SavedWork from './saved-work';
import DesktopExport from './desktop-export';
import ProjectFolderSave from './project-folder-save';
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
  Draft,
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
export function Accounts({
  data,
  isDemo,
  configured,
  refresh,
  notify,
  run,
  onCompose,
}: Common & {
  configured: boolean;
  onCompose: (draft: Draft) => void;
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [provider, setProvider] = useState<Provider>(data.email?.endsWith('@naver.com') ? 'naver' : /@(daum.net|hanmail.net)$/.test(data.email || '') ? 'daum' : /@yahoo\./.test(data.email || '') ? 'yahoo' : 'custom'),
    [email, setEmail] = useState(data.email || ""),
    [password, setPassword] = useState("");
  const onboarding = !isDemo && data.accounts.length === 0;
  const connectingRef = useRef(false);
  const [imapHost, setImapHost] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [username, setUsername] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("");
  const [connectionFailed, setConnectionFailed] = useState(false);
  return (
    <div className="accounts-grid">
      {onboarding && <section className="surface" style={{gridColumn:"1 / -1"}}><h2>가입 완료 · 업무 메일 연결</h2><p>이제 메일함을 연결하면 준비가 끝납니다. 가입 이메일을 미리 입력했습니다.</p><p>Gmail은 아래 Google 연결 동의로, 네이버·회사 메일은 메일 서비스의 앱 비밀번호와 서버 설정으로 연결하세요. Atlasgori 가입 비밀번호와는 다릅니다.</p></section>}
      {!isDemo && !onboarding && <DesktopExport />}
      {!isDemo && !onboarding && <ProjectFolderSave />}
      {!isDemo && !onboarding && <AiUsage />}
      {!isDemo && !onboarding && <section className="surface" style={{gridColumn:'1 / -1'}}><SavedWork kind="draft" onOpen={entry=>onCompose({...entry.value,savedId:entry.id,savedVersion:entry.version})}/></section>}
      {!onboarding && <AiPreview data={data} onCompose={onCompose} />}
      <section className="surface">
        <div className="section-heading">
          <h2>내 메일 계정</h2>
          <span className="tag">{data.accounts.length}개</span>
        </div>
        {data.accounts.map((a) => (
          <div className="account-row" key={a.id}>
            <span className={`provider-logo ${a.provider}`}>
              {a.provider[0].toUpperCase()}
            </span>
            <div>
              <b>{a.email}</b>
              <p>
                {a.provider.toUpperCase()} ·{" "}
                {isDemo
                  ? "샘플 계정"
                  : a.last_synced_at
                    ? `마지막 동기화 ${new Date(a.last_synced_at).toLocaleString("ko-KR")}`
                    : "연결됨 · 동기화 대기"}
              </p>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={a.ai_enabled}
                  disabled={isDemo || !data.aiReady}
                  onChange={(e) =>
                    run(async () => {
                      await action("accountAi", {
                        accountId: a.id,
                        enabled: e.target.checked,
                      });
                      await refresh();
                    })
                  }
                />
                메일·첨부파일의 외부 AI 처리를 허용
              </label>
              <small>
                활성화하면 본문과 지원 첨부파일의 텍스트가 AI 제공자에게
                전달됩니다.
              </small>
              <label className="check-label">
                <input type="checkbox" checked={!!a.automation_enabled} disabled={isDemo || !a.ai_enabled || !data.aiReady}
                  onChange={e => { const enabled = e.target.checked; run(async()=>{ await action("accountAutomation", {accountId:a.id,enabled}); await refresh(); }); }}/>
                수신 시 프로젝트 자동 분류 · 전체 요약 · 답신 제안
              </label>
              <small>명확한 업무 메일은 비공개 프로젝트로 정리하고 변경되었거나 아직 전체 요약이 없는 프로젝트를 순차 요약합니다. 같은 프로젝트의 AI 동의된 다른 계정 과거 메일도 포함합니다. 본문·지원 첨부자료를 외부 AI로 전송하며 사용량이 차감됩니다. 발송은 최종 승인 후에만 진행됩니다.</small>
              <div className="row">
                <button
                  className="text-button"
                  onClick={() =>
                    run(async () => {
                      if (isDemo) {
                        notify("샘플 계정입니다.");
                        return;
                      }
                      const r = await action("sync", {
                        accountId: a.id,
                        backfill: true,
                      });
                      await refresh();
                      notify(
                        `${r.count}건을 가져왔습니다.${r.hasMore ? " 더 가져올 메일이 있습니다." : ""}`,
                      );
                    })
                  }
                >
                  과거 메일 더 가져오기
                </button>
                <button
                  className="text-button danger"
                  onClick={() => {
                    if (isDemo) {
                      notify("샘플 계정은 삭제되지 않습니다.");
                      return;
                    }
                    if (
                      window.confirm(
                        "계정 연결과 atlasgori에 저장된 해당 계정의 메일·첨부파일을 삭제할까요? 원본 메일은 유지됩니다.",
                      )
                    )
                      run(async () => {
                        await action("disconnect", { accountId: a.id });
                        await refresh();
                      });
                  }}
                >
                  연결 해제
                </button>
              </div>
            </div>
          </div>
        ))}
        {!data.accounts.length && (
          <div className="empty-state">
            <Link2 />
            <h3>연결된 계정이 없습니다</h3>
            <p>계정을 추가하면 메일 수신과 발신을 시작할 수 있습니다.</p>
          </div>
        )}
      </section>
      <section className="surface">
        <div className="section-heading">
          <h2>계정 연결</h2>
          <ShieldCheck size={20} />
        </div>
        <button
          className="provider-connect"
          disabled={isDemo || !data.gmailReady}
          onClick={() => window.location.assign("/api/oauth/google")}
        >
          <span className="provider-logo gmail">G</span>
          <div>
            <b>Google / Gmail</b>
            <small>
              {data.gmailReady
                ? "Google 로그인으로 안전하게 연결"
                : "Google OAuth 설정 필요"}
            </small>
          </div>
          <ArrowUpRight size={20} />
        </button>
        <div className="provider-connect disabled">
          <span className="provider-logo outlook">O</span>
          <div>
            <b>Outlook / Office 365</b>
            <small>Microsoft Graph 연결 준비 중</small>
          </div>
          <span className="tag">예정</span>
        </div>
        <div className="divider">네이버 · 다음 · Yahoo · 기타 회사 메일</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (connectingRef.current) return;
            connectingRef.current = true;
            setConnecting(true);
            setConnectionFailed(false);
            setConnectionStatus("수신·발신 서버에 연결 중입니다. 잠시 기다려 주세요.");
            run(async () => {
              try {
              if (isDemo) {
                setConnectionStatus("실제 계정 연결은 서버 설정과 로그인 후 가능합니다.");
                return;
              }
              await action("connectImap", { provider, email, password,
                ...(provider === 'custom' ? {custom:{imap:imapHost,smtp:smtpHost,port:smtpPort,username:username.trim() || email.trim()}} : {}) });
              setPassword("");
              setConnectionStatus("수신·발신 인증을 확인하고 연결했습니다.");
              try { await refresh(); } catch {
                setConnectionStatus("메일 계정은 연결됐지만 목록을 갱신하지 못했습니다. 페이지를 새로고침해 주세요.");
                return;
              }
              notify("수신·발신 인증을 확인하고 연결했습니다.");
              } catch (error) {
                setConnectionFailed(true);
                setConnectionStatus(error instanceof Error ? error.message : "연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
              } finally {
                connectingRef.current = false;
                setConnecting(false);
              }
            });
          }}
        >
          <label>
            메일 서비스
            <select
              disabled={connecting}
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
            >
              <option value="naver">NAVER</option>
              <option value="daum">Daum / Hanmail</option>
              <option value="yahoo">Yahoo</option>
              <option value="custom">기타 회사 메일 (IMAP/SMTP)</option>
            </select>
          </label>
          <label>
            메일 주소
            <input
              type="email"
              disabled={connecting}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {provider === 'custom' && <fieldset disabled={connecting} style={{border:'1px solid #94a3b8',borderRadius:12,padding:16,margin:'12px 0'}}>
            <legend>회사 메일 서버 설정</legend>
            <button type="button" className="text-button" onClick={()=>{setImapHost('wmbox4.ecount.com');setSmtpHost('wsmtp.ecount.com');setSmtpPort(587);}}>이카운트 설정 채우기</button>
            <label>받는 서버 (IMAP)<input required value={imapHost} onChange={e=>setImapHost(e.target.value)} placeholder="imap.example.com" autoCapitalize="none" spellCheck={false}/></label>
            <small>포트 993 · SSL/TLS 보안 연결</small>
            <label>보내는 서버 (SMTP)<input required value={smtpHost} onChange={e=>setSmtpHost(e.target.value)} placeholder="smtp.example.com" autoCapitalize="none" spellCheck={false}/></label>
            <label>보내는 서버 보안<select value={smtpPort} onChange={e=>setSmtpPort(Number(e.target.value))}><option value={587}>587 · STARTTLS</option><option value={465}>465 · SSL/TLS</option></select></label>
            <label>로그인 사용자 이름<input value={username} onChange={e=>setUsername(e.target.value)} placeholder="비워두면 위 메일 주소 사용" autoCapitalize="none" spellCheck={false}/></label>
            <small>메일 관리자에게 받은 서버 주소를 입력하세요. 이카운트 받는 서버는 회사마다 다를 수 있습니다. Google·Microsoft 계정은 전용 OAuth 연결을 사용하세요.</small>
          </fieldset>}
          <label>
            {provider === 'custom' ? '회사 메일 비밀번호 또는 앱 비밀번호' : '앱 비밀번호'}
            <input
              type="password"
              autoComplete="off"
              required
              value={password}
              disabled={isDemo || connecting}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                isDemo
                  ? "데모에서는 입력하지 마세요"
                  : provider === 'custom' ? '회사 메일 서비스가 지정한 비밀번호' : "서비스에서 발급한 앱 비밀번호"
              }
            />
          </label>
          <p className="help-text">
            메일 서비스에서 IMAP/SMTP를 허용해 주세요. 연결 정보는 서버에
            암호화하여 보관합니다.
          </p>
          {connectionStatus && <p role={connectionFailed ? "alert" : "status"} aria-live="polite" className="help-text">{connectionStatus}</p>}
          <button className="button primary" disabled={isDemo || connecting} aria-busy={connecting}>
            <Link2 size={16} />
            {connecting ? "연결 확인 중…" : "연결 확인 후 추가"}
          </button>
        </form>
        <div className="setup-note">
          <b>연결 준비 상태</b>
          <p>로그인·데이터베이스: {configured ? "설정됨" : "설정 필요"}</p>
          <p>Gmail OAuth: {data.gmailReady ? "준비됨" : "설정 필요"}</p>
          <p>AI: {data.aiReady ? "준비됨 · 계정별 동의 필요" : "설정 필요"}</p>
          <p>소싱 검색: {data.searchReady ? "준비됨" : "검색 API 설정 필요"}</p>
        </div>
      </section>
    </div>
  );
}


