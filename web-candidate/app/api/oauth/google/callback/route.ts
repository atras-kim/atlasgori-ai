import { cookies } from "next/headers";
import { authenticated, admin, checked } from "@/lib/db";
import {
  unseal,
  same,
  appOrigin,
  env,
  upstreamJson,
  AppError,
  errorResponse,
} from "@/lib/security";
import { saveCredential } from "@/lib/providers";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const { user } = await authenticated(),
      url = new URL(req.url),
      jar = await cookies(),
      stored = jar.get("atlas-google-oauth")?.value;
    jar.delete({ name: "atlas-google-oauth", path: "/api/oauth/google" });
    if (!stored)
      throw new AppError(
        "연결 요청이 만료되었습니다. 다시 연결해 주세요.",
        403,
      );
    const c = unseal<{
      state: string;
      verifier: string;
      userId: string;
      expires: number;
    }>(stored, "oauth");
    if (
      c.userId !== user.id ||
      c.expires < Date.now() ||
      !same(c.state, url.searchParams.get("state") || "")
    )
      throw new AppError("연결 확인에 실패했습니다.", 403);
    const consumed = checked(
      await admin()
        .from("oauth_states")
        .update({ consumed: true })
        .eq("id", c.state)
        .eq("owner_id", user.id)
        .eq("consumed", false)
        .gt("expires_at", new Date().toISOString())
        .select("id"),
    );
    if (!consumed.data?.length)
      throw new AppError("이미 처리되었거나 만료된 연결 요청입니다.", 403);
    const code = url.searchParams.get("code");
    if (!code) throw new AppError("Google 연결이 취소되었습니다.");
    const t = await upstreamJson<{
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    }>("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: env("GOOGLE_CLIENT_ID"),
        client_secret: env("GOOGLE_CLIENT_SECRET"),
        code,
        code_verifier: c.verifier,
        redirect_uri: `${appOrigin()}/api/oauth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (
      !t.scope?.includes("gmail.readonly") ||
      !t.scope?.includes("gmail.send") ||
      !t.refresh_token
    )
      throw new AppError("수신·발신 권한과 지속 연결 동의가 필요합니다.");
    const profile = await upstreamJson<{ emailAddress: string }>(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      { headers: { Authorization: `Bearer ${t.access_token}` } },
    );
    const { data } = checked(
      await admin()
        .from("mail_accounts")
        .upsert(
          {
            owner_id: user.id,
            email: profile.emailAddress.toLowerCase(),
            provider: "gmail",
          },
          { onConflict: "owner_id,email" },
        )
        .select("*")
        .single(),
    );
    await saveCredential(data, {
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: Date.now() + t.expires_in * 1000,
    });
    return Response.redirect(`${appOrigin()}/?connected=gmail`);
  } catch (e) {
    return errorResponse(e);
  }
}
