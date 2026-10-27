import type { Provider } from "./types";
import { AppError, unseal, seal, upstreamJson, env } from "./security";
import { admin, checked } from "./db";
import { customMailSchema, mailTarget, type CustomMail } from './custom-mail';
export const presets = {
  naver: {
    imap: "imap.naver.com",
    smtp: "smtp.naver.com",
    port: 587,
    domains: ["naver.com"],
  },
  daum: {
    imap: "imap.daum.net",
    smtp: "smtp.daum.net",
    port: 465,
    domains: ["daum.net", "hanmail.net"],
  },
  yahoo: {
    imap: "imap.mail.yahoo.com",
    smtp: "smtp.mail.yahoo.com",
    port: 465,
    domains: [
      "yahoo.com",
      "yahoo.co.uk",
      "yahoo.co.kr",
      "ymail.com",
      "rocketmail.com",
    ],
  },
} as const;
export function preset(provider: Provider, email: string) {
  if (!(provider in presets))
    throw new AppError("지원하지 않는 메일 연결 방식입니다.");
  const p = presets[provider as keyof typeof presets];
  if (
    !(p.domains as readonly string[]).includes(
      email.split("@")[1]?.toLowerCase(),
    )
  )
    throw new AppError("선택한 서비스의 메일 주소를 입력해 주세요.");
  return p;
}
export type Account = {
  id: string;
  owner_id: string;
  email: string;
  provider: Provider;
  ai_enabled: boolean;
  automation_enabled?: boolean;
  backfill_cursor: string | null;
};
export type Credential = {
  custom?: CustomMail;
  password?: string;
  refresh_token?: string;
  access_token?: string;
  expires_at?: number;
};
export async function credential(account: Account) {
  const result = checked(
    await admin()
      .from("account_secrets")
      .select("ciphertext")
      .eq("account_id", account.id)
      .single(),
  );
  if (!result.data) throw new AppError("계정을 다시 연결해 주세요.", 409);
  return unseal<Credential>(
    result.data.ciphertext,
    `${account.owner_id}:${account.id}`,
  );
}
export async function saveCredential(account: Account, value: Credential) {
  checked(
    await admin()
      .from("account_secrets")
      .upsert({
        account_id: account.id,
        ciphertext: seal(value, `${account.owner_id}:${account.id}`),
      }),
  );
}
export async function gmailToken(account: Account) {
  const c = await credential(account);
  if (c.access_token && c.expires_at && c.expires_at > Date.now() + 60000)
    return c.access_token;
  if (!c.refresh_token)
    throw new AppError("Gmail 계정을 다시 연결해 주세요.", 409);
  const t = await upstreamJson<{ access_token: string; expires_in: number }>(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: env("GOOGLE_CLIENT_ID"),
        client_secret: env("GOOGLE_CLIENT_SECRET"),
        refresh_token: c.refresh_token,
        grant_type: "refresh_token",
      }),
    },
  );
  await saveCredential(account, {
    ...c,
    access_token: t.access_token,
    expires_at: Date.now() + t.expires_in * 1000,
  });
  return t.access_token;
}
export async function imapClient(account: Account, password?: string, custom?: CustomMail) {
  const { ImapFlow } = await import("imapflow");
  const stored = password ? { password, custom } : await credential(account);
  const p = account.provider === 'custom' ? customMailSchema.parse(stored.custom) : preset(account.provider, account.email),
    pass = stored.password;
  if (!pass) throw new AppError("앱 비밀번호가 필요합니다.");
  return new ImapFlow({
    host: account.provider === 'custom' ? await mailTarget(p.imap) : p.imap,
    port: 993,
    secure: true,
    auth: { user: 'username' in p ? p.username : account.email, pass },
    logger: false,
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2", servername: p.imap },
    connectionTimeout: 15000,
    socketTimeout: 30000,
    maxIdleTime: 10000,
  });
}
export async function smtpClient(account: Account, password?: string, custom?: CustomMail) {
  const nodemailer = await import("nodemailer");
  const stored = password ? { password, custom } : await credential(account);
  const p = account.provider === 'custom' ? customMailSchema.parse(stored.custom) : preset(account.provider, account.email),
    pass = stored.password;
  if (!pass) throw new AppError("앱 비밀번호가 필요합니다.");
  return nodemailer.createTransport({
    host: account.provider === 'custom' ? await mailTarget(p.smtp) : p.smtp,
    port: p.port,
    secure: p.port === 465,
    requireTLS: true,
    auth: { user: 'username' in p ? p.username : account.email, pass },
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2", servername: p.smtp },
    connectionTimeout: 15000,
    socketTimeout: 30000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}
// Microsoft Graph shares the same account and message contracts; connection is deliberately disabled until OAuth registration is configured and tested.
export const providerCapabilities: Record<
  Provider,
  { oauth: boolean; enabled: boolean }
> = {
  gmail: { oauth: true, enabled: true },
  naver: { oauth: false, enabled: true },
  daum: { oauth: false, enabled: true },
  yahoo: { oauth: false, enabled: true },
  outlook: { oauth: true, enabled: false },
  custom: { oauth: false, enabled: true },
};
