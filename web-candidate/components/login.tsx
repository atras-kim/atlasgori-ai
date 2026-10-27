"use client";
import { useState } from "react";
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
export function Login({
  onDone,
  onDemo,
}: {
  onDone: () => Promise<void>;
  onDemo: () => void;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [signup,setSignup]=useState(false),[invite,setInvite]=useState(''),[message,setMessage]=useState('');
  return (
    <form
      className="login surface"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const r = await fetch(signup?"/api/signup":"/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "login", email, password, invite }),
          });
          if (!r.ok) throw new Error((await r.json()).error);
          if(signup){setMessage('가입 요청이 완료되었습니다. 이메일 인증 후 로그인해 주세요.');setSignup(false);setPassword('');setInvite('');}else await onDone();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className="eyebrow">WELCOME TO atlasgori</span>
      <h2>{signup?'초대받은 고객 회원가입':'내 워크스페이스에 로그인'}</h2>
      <p>{signup?'초대받은 이메일과 일회용 코드를 입력하세요. 가입 시 인증 메일이 발송됩니다.':'atlasgori 계정으로 로그인하세요.'}</p>
      {message&&<p role="status">{message}</p>}
      {signup&&<label>초대코드<input required value={invite} onChange={e=>setInvite(e.target.value.trim())} autoComplete="off" maxLength={43}/></label>}
      <label>
        이메일
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
        />
      </label>
      <label>
        비밀번호
        <input
          type="password"
          required
          value={password}
          minLength={signup?12:undefined}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={signup?'new-password':'current-password'}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="button primary" disabled={busy}>
        {busy?'처리 중…':signup?'가입하고 인증 메일 받기':'로그인'}
      </button>
      <button className="text-button" type="button" disabled={busy} onClick={()=>{setSignup(!signup);setError('');setMessage('');}}>{signup?'로그인으로 돌아가기':'초대코드로 회원가입'}</button>
      <button className="text-button" type="button" onClick={onDemo}>
        샘플 화면 둘러보기
      </button>
    </form>
  );
}
