"use client";
import InstallApp from "./install-app";
import MemberAdmin from './member-admin';
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  ChevronDown,
  Globe2,
  Inbox,
  LayoutGrid,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  X,
  LogOut,
  Menu,
} from "lucide-react";
import { demo } from "@/lib/demo";
import type { Draft, Message, Project, WorkspaceData } from "@/lib/types";
import Composer from "./composer";
import ExchangeRates from "./exchange-rates";
import { Accounts, Projects, Sourcing, Login } from "./views";
import { action } from "@/lib/client-api";
import InboxDashboard from "./inbox-dashboard";
import SidebarAccounts from "./sidebar-accounts";
import { empty, titles } from "@/lib/client-defaults";
export default function Workspace({ configured }: { configured: boolean }) {
  const [composeKey, setComposeKey] = useState(0), [composeFocus, setComposeFocus] = useState(0), [sourcingQuery, setSourcingQuery] = useState("");
  const parkedDrafts = useRef(new Map<string, Draft>());
  const [composeBusy, setComposeBusy] = useState(false);
  const [isDemo, setDemo] = useState(!configured),
    [data, setData] = useState<WorkspaceData>(configured ? empty : demo),
    [view, updateView] = useState("inbox"),
    [selected, setSelected] = useState("m1"),
    [projectId, setProject] = useState("p1"),
    [query, setQuery] = useState(""),
    [account, setAccount] = useState("all"),
    [compose, setCompose] = useState<Draft | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [login, setLogin] = useState(false),
    [loading, setLoading] = useState(configured),
    [nav, setNav] = useState(false);
  const currentUser = useRef(data.userId);
  currentUser.current = data.userId;
  function clearDrafts() { parkedDrafts.current.clear(); setCompose(null); setComposeKey(v=>v+1); }
  const previousAccountCount = useRef(0);
  async function refresh() {
    if (isDemo) return;
    const r = await fetch("/api/workspace", { cache: "no-store" });
    if (r.status === 401) { clearDrafts(); setData(empty);
      setLogin(true);
      setLoading(false);
      return;
    }
    const next = await r.json();
    if (!r.ok) throw new Error(next.error);
    if (next.userId !== currentUser.current) clearDrafts();
    currentUser.current = next.userId;
    if (!next.accounts.length) updateView('accounts');
    else if (!previousAccountCount.current) updateView('inbox');
    previousAccountCount.current = next.accounts.length;
    setData(next);
    setLoading(false);
    setLogin(false);
  }
  function setView(next: string) { if (composeBusy) { setNotice("메일 처리 완료 후 이동해 주세요."); return; } updateView(next); setNav(false); }
  useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setNav(false);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[]);
  useEffect(() => {
    if (!isDemo)
      refresh().catch((e) => {
        setNotice(e.message);
        setLoading(false);
      });
  }, [isDemo]); // authenticated data is never persisted in browser storage
  useEffect(()=>{
    const updated=()=>{if(!isDemo)refresh().catch(error=>setNotice(error.message));};
    window.addEventListener('atlas-project-organized',updated);
    return()=>window.removeEventListener('atlas-project-organized',updated);
  },[isDemo]);
  useEffect(() => {
    if (isDemo || !data.userId || !data.accounts.length) return;
    let inFlight = false;
    const timer = setInterval(async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        for (const a of data.accounts) {
          const synced=await action("sync", { accountId: a.id });
          if(synced.aiWarning)setNotice(synced.aiWarning);
        }
        await refresh();
      } catch {
        setNotice(
          "자동 동기화가 완료되지 않았습니다. 계정 연결을 확인해 주세요.",
        );
      } finally {
        inFlight = false;
      }
    }, 120000);
    return () => clearInterval(timer);
  }, [isDemo, data.userId, data.accounts.map((a) => a.id).join(",")]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 8000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "처리 중 오류가 발생했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  const filtered = data.messages.filter(
    (m) =>
      (account === "all" || m.account_id === account) &&
      `${m.subject} ${m.sender} ${m.body}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const mail = filtered.find((m) => m.id === selected) || filtered[0];
  const project =
    data.projects.find((p) => p.id === projectId) || data.projects[0];
  const replyPending = useRef(false);
  const replyContext = useRef('');
  replyContext.current = `${selected}|${account}|${query}|${view}|${isDemo}`;
  async function newDraft(m?: Message) {
    if (replyPending.current) return;
    if (composeBusy) { setNotice("메일 처리 완료 후 새 메일을 작성해 주세요."); return; }
    if (compose && (compose.to || compose.cc || compose.bcc || compose.subject || compose.body || compose.attachments.length)) { setNotice("작성 중인 초안을 유지했습니다. 작성 탭에서 이어서 작성하세요."); setComposeFocus(v => v + 1); return; }
    if (m && !isDemo) {
      const context = replyContext.current;
      replyPending.current = true;
      setComposeBusy(true);
      setNotice('원메일의 참조(CC)를 확인하고 있습니다…');
      try {
        const result = await action('replyDraft', { messageId: m.id });
        if (replyContext.current !== context) { setNotice('선택한 메일이 바뀌었습니다. 현재 메일에서 다시 답장 작성을 눌러 주세요.'); return; }
        setComposeKey(v=>v+1);
        setCompose(result.draft);
        setNotice('원메일의 CC를 반영했습니다. 수신자를 확인한 뒤 작성해 주세요.');
      } catch(error) { setNotice(error instanceof Error ? error.message : 'CC를 확인하지 못했습니다. 다시 시도해 주세요.'); }
      finally { replyPending.current=false; setComposeBusy(false); }
      return;
    }
    setComposeKey(v => v + 1);
    setCompose({
      sourceMessageId: m?.id,
      accountId: m?.account_id || data.accounts[0]?.id || "",
      to: m?.sender.match(/<([^>]+)>/)?.[1] || m?.sender || "",
      cc: "",
      bcc: "",
      subject: m ? `Re: ${m.subject.replace(/^Re:\s*/i, "")}` : "",
      body: "",
      attachments: [],
    });
  }
  async function assign(m: Message, id: string) {
    if (isDemo) {
      setData({
        ...data,
        messages: data.messages.map((x) =>
          x.id === m.id ? { ...x, project_id: id || null } : x,
        ),
      });
      return;
    }
    await run(async () => {
      await action("assign", { messageId: m.id, projectId: id || null });
      await refresh();
      setNotice("프로젝트 분류를 저장했습니다.");
    });
  }
  async function sync() {
    if (isDemo) {
      setNotice(
        "샘플 화면입니다. 실제 동기화는 로그인 후 계정을 연결해 주세요.",
      );
      return;
    }
    await run(async () => {
      const results = [];
      for (const a of data.accounts) {
        try {
          const d = await action("sync", { accountId: a.id });
          results.push(`${a.email}: ${d.count}건`);
        } catch (e) {
          results.push(
            `${a.email}: ${e instanceof Error ? e.message : "오류"}`,
          );
        }
      }
      await refresh();
      setNotice(results.join(" · ") || "먼저 메일 계정을 연결해 주세요.");
    });
  }
  const openProject = (p: Project) => {
    setProject(p.id);
    setView("projects");
  };
  return (<div className={`app-shell ${view === "inbox" ? "dashboard-shell" : ""}`}>
      {nav && <button className="mobile-nav-backdrop" aria-label="메뉴 닫기" onClick={()=>setNav(false)} />}
      <aside id="workspace-navigation" className={`sidebar ${nav ? "mobile-open" : ""}`}>
        <a className="brand" href="/" aria-label="atlasgori 홈">
          <img src="/brand/atlasgori-blue-black.png" width={160} height={160} alt="atlasgori — Good Trade, Better Life" style={{display:'block',width:'100%',maxWidth:160,height:'auto',borderRadius:12,margin:'0 auto'}}/>

        </a>
        <div className="org">
          <span className="org-icon">G</span>
          <div>
            My workspace<small>비즈니스 메일 · 프로젝트</small>
          </div>
        </div>
        <nav>
          {[
            { id: "inbox", icon: Inbox },
            { id: "projects", icon: BriefcaseBusiness },
            { id: "sourcing", icon: Globe2 },
          ].map(({ id, icon: Icon }) => (
            <button
              key={id}
              className={view === id ? "nav-item active" : "nav-item"}
              onClick={() => {
                setView(id);
                setNav(false);
              }}
            >
              <Icon size={19} />
              {titles[id]}
              {id === "inbox" && (
                <span className="count">
                  {data.messages.filter((m) => m.unread).length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <SidebarAccounts accounts={data.accounts} onSelect={id=>{setAccount(id);setView("inbox");setNav(false);}} />
        <div className="nav-section">
          PROJECTS{" "}
          <button
            aria-label="프로젝트 추가"
            onClick={() => setView("projects")}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="project-nav">
          {data.projects.map((p, i) => (
            <button key={p.id} onClick={() => openProject(p)}>
              <span className={`project-square color-${i % 3}`} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          {!isDemo&&data.isOperator&&<button className="nav-item" onClick={()=>setView('members')}>회원 · AI 이용 관리</button>}
          <div className="private-note">
            <ShieldCheck size={17} />
            <span>
              공유 범위를 직접 관리하세요<small>기본값은 Private</small>
            </span>
          </div>
          {[
            { id: "admin", icon: LayoutGrid },
            { id: "accounts", icon: Settings2 },
          ].map(({ id, icon: Icon }) => (
            <button
              key={id}
              className={view === id ? "nav-item active" : "nav-item"}
              onClick={() => setView(id)}
            >
              <Icon size={18} />
              {titles[id]}
            </button>
          ))}
          <div className="profile">
            <span className="avatar">ME</span>
            <div>
              My account
              <small>
                {isDemo ? "데모 워크스페이스" : data.email || "로그인 필요"}
              </small>
            </div>
            {!isDemo && data.userId && (
              <button
                aria-label="로그아웃"
                onClick={() =>
                  run(async () => {
                    await fetch("/api/auth", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ mode: "logout" }),
                    });
                    clearDrafts(); setData(empty);
                    setLogin(true);
                  })
                }
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            className="mobile-toggle"
            onClick={() => setNav(!nav)}
            aria-label="메뉴"
            aria-expanded={nav}
            aria-controls="workspace-navigation"
          >
            <Menu size={20} />
          </button>
          <span className="breadcrumb">
            WORKSPACE <span>/</span> {titles[view]}
          </span>
          <ExchangeRates />
          <InstallApp />
        </header>
        {isDemo && (
          <div className="demo-banner">
            <span>
              <b>DEMO</b> 샘플 데이터로 atlasgori를 둘러보고 있습니다. 실제 메일은
              발송되지 않습니다.
            </span>
            {configured ? (
              <button
                onClick={() => {
                  setDemo(false);
                  clearDrafts(); setData(empty);
                }}
              >
                실제 계정 로그인 <ArrowUpRight size={14} />
              </button>
            ) : (
              <button onClick={() => setView("accounts")}>
                연결 준비 상태 보기 <ArrowUpRight size={14} />
              </button>
            )}
          </div>
        )}
        <section className="page-heading">
          <div>
            <div className="eyebrow">YOUR BUSINESS, IN CONTEXT</div>
            <h1>
              {titles[view]}
              <span className="heading-dot" />
            </h1>
            <p>
              {view === "inbox"
                ? "여러 계정의 대화를 한곳에서, 다음 업무까지 이어가세요."
                : view === "projects"
                  ? "흩어진 대화와 견적을 프로젝트 중심으로 정리하세요."
                  : view === "sourcing"
                    ? "찾고 있는 제품과 조건을 입력해 공급업체를 탐색하세요."
                    : view === "admin"
                      ? "프로젝트 이름으로 업무 현황과 공유 범위를 확인하세요."
                      : "사용 중인 메일을 연결하고 동기화 상태를 확인하세요."}
            </p>
          </div>
          <div className="heading-actions">
            <button
              className="button"
              disabled={busy || loading}
              onClick={sync}
            >
              <RefreshCw size={16} className={busy ? "spin" : ""} />
              동기화
            </button>
            <button className="button primary" onClick={() => newDraft()}>
              <Plus size={17} />
              메일 작성
            </button>
          </div>
        </section>
        <div className="workspace-body">{loading ? (
          <div className="empty-state">워크스페이스를 불러오는 중입니다…</div>
        ) : login && !isDemo ? (
          <Login
            onDone={refresh}
            onDemo={() => {
              setDemo(true);
              clearDrafts(); setData(demo);
              setLogin(false);
            }}
          />
        ) : (
          <>
            {view==='members'&&data.isOperator&&<MemberAdmin/>}
            {view === "inbox" && (
              <InboxDashboard
                parkedDrafts={parkedDrafts} draft={compose} onDraft={setCompose} onSent={refresh} composeKey={composeKey} composeFocus={composeFocus} onSource={setSourcingQuery} onComposeBusy={setComposeBusy} composeBusy={composeBusy}
                {...{
                  data,
                  account,
                  setAccount,
                  query,
                  setQuery,
                  filtered,
                  mail,
                  setSelected,
                  busy,
                  isDemo,
                  assign,
                  setNotice,
                  newDraft,
                  setProject,
                  setView,
                }}
              />
            )}
            {(view === "projects" || view === "admin") && (
              <Projects
                data={data}
                isDemo={isDemo}
                admin={view === "admin"}
                selected={project}
                onSelect={setProject}
                onChange={setData}
                refresh={refresh}
                notify={setNotice}
                run={run}
              />
            )}
            {view === "sourcing" && (
              <Sourcing
                initialQuery={sourcingQuery}
                data={data}
                isDemo={isDemo}
                onChange={setData}
                refresh={refresh}
                notify={setNotice}
              />
            )}
            {view === "accounts" && (
              <Accounts
                onCompose={draft => {
                  if (composeBusy) { setNotice('메일 처리가 끝난 후 다시 열어 주세요.'); return; }
                  if (compose && (compose.to || compose.cc || compose.bcc || compose.subject || compose.body || compose.attachments.length)) {
                    setNotice('작성 중인 메일을 유지했습니다. 먼저 현재 작성창을 마무리해 주세요.'); return;
                  }
                  setComposeKey(v => v + 1); setCompose(draft);
                }}
                data={data}
                configured={configured}
                isDemo={isDemo}
                refresh={refresh}
                notify={setNotice}
                run={run}
              />
            )}
          </>
        )}
        </div><footer className="workspace-footer">
          <span>
            atlasgori <span> / </span> AI BUSINESS WORKSPACE
          </span>
          <span>
            {isDemo
              ? "샘플 화면 · 실제 연동 없음"
              : "개인정보는 프로젝트 공유 범위에 따라 접근됩니다."}
          </span>
        </footer>
      </main>
      {compose && view !== "inbox" && (
        <Composer
          key={composeKey} onBusy={setComposeBusy}
          draft={compose}
          accounts={data.accounts}
          isDemo={isDemo}
          onClose={() => setCompose(null)}
          onChange={setCompose}
          notify={setNotice}
          onSent={refresh}
        />
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button onClick={() => setNotice("")} aria-label="알림 닫기">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
