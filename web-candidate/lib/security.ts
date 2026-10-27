import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function env(name: string) {
  const value = process.env[name];
  if (!value) throw new AppError("서버 연결 설정이 필요합니다.", 503);
  return value;
}
export function appOrigin() {
  const value = new URL(env("ATLAS_APP_URL"));
  if (
    value.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(value.hostname)
  )
    throw new AppError("HTTPS 주소 설정이 필요합니다.", 503);
  return value.origin;
}
export function assertOrigin(request: Request) {
  if (request.headers.get("origin") !== appOrigin())
    throw new AppError("허용되지 않은 요청입니다.", 403);
}
export async function jsonBody(request: Request, maxBytes = 15 * 1024 * 1024) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError("JSON 요청이 필요합니다.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("요청 본문이 없습니다.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AppError("요청 크기가 너무 큽니다.", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("올바른 JSON 형식이 아닙니다.");
  }
}
function key() {
  const k = Buffer.from(env("ATLAS_ENCRYPTION_KEY"), "base64");
  if (k.length !== 32) throw new AppError("암호화 키 설정이 필요합니다.", 503);
  return k;
}
export function seal(value: unknown, context: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export function unseal<T>(value: string, context: string): T {
  const [v, iv, tag, data] = value.split(".");
  if (v !== "v1" || !iv || !tag || !data)
    throw new AppError("연결 인증정보를 확인할 수 없습니다.", 503);
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(data, "base64url")),
      cipher.final(),
    ]).toString("utf8"),
  );
}
export const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const nonce = () => randomBytes(32).toString("base64url");
export function same(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
const singleLine = z
  .string()
  .refine((s) => !/[\r\n\0]/.test(s), "줄바꿈을 포함할 수 없습니다.");
export const address = singleLine.max(254).pipe(z.email());
export function addresses(value: string) {
  if (!value.trim()) return [];
  const result = value.split(/[,;]/).map((s) => address.parse(s.trim()));
  if (result.length > 50) throw new AppError("수신자는 최대 50명입니다.");
  return result;
}
export const attachmentSchema = z.object({
  name: singleLine
    .min(1)
    .max(200)
    .refine((s) => !/[\\/]/.test(s), "파일명에 경로는 허용되지 않습니다."),
  type: singleLine.max(120),
  content: z
    .string()
    .max(14_000_000)
    .regex(/^[A-Za-z0-9+/]*={0,2}$/),
});
export const draftSchema = z.object({
  accountId: z.uuid(),
  to: z.string().min(1).max(13000),
  cc: z.string().max(13000),
  bcc: z.string().max(13000),
  subject: singleLine.min(1).max(998),
  body: z.string().max(500000),
  attachments: z.array(attachmentSchema).max(10),
});
export function validateDraft(input: unknown) {
  const d = draftSchema.parse(input);
  const to = addresses(d.to),
    cc = addresses(d.cc),
    bcc = addresses(d.bcc);
  if (!to.length || to.length + cc.length + bcc.length > 50)
    throw new AppError("수신자는 1명 이상, 합계 50명 이하여야 합니다.");
  if (
    d.attachments.reduce(
      (n, a) => n + Buffer.from(a.content, "base64").length,
      0,
    ) >
    10 * 1024 * 1024
  )
    throw new AppError("첨부파일 합계는 10 MB 이하여야 합니다.");
  return { ...d, to, cc, bcc };
}
export function safeUrl(value: string) {
  const u = new URL(value);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
    throw new AppError("허용되지 않은 URL입니다.");
  return u.href;
}
export function errorResponse(e: unknown) {
  if (e instanceof AppError)
    return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError)
    return Response.json(
      {
        error: "입력값을 확인해 주세요.",
        fields: e.issues.map((i) => i.path.join(".")),
      },
      { status: 400 },
    );
  return Response.json(
    {
      error:
        "요청을 완료하지 못했습니다. 연결 설정과 서비스 상태를 확인해 주세요.",
    },
    { status: 500 },
  );
}
export async function upstreamJson<T>(
  url: string,
  init: RequestInit = {},
  maxBytes = 1024 * 1024,
): Promise<T> {
  const r = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok)
    throw new AppError(
      r.status === 401 || r.status === 403
        ? "연결 권한이 만료되었거나 부족합니다. 계정을 다시 연결해 주세요."
        : "외부 서비스 요청에 실패했습니다. 잠시 후 연결 상태를 확인해 주세요.",
      502,
    );
  const reader = r.body?.getReader();
  if (!reader) throw new AppError("외부 서비스 응답이 없습니다.", 502);
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AppError("외부 서비스 응답이 너무 큽니다.", 502);
    }
    parts.push(value);
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
