import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { authenticated, limit, admin, checked } from "@/lib/db";
import { appOrigin, env, nonce, seal, errorResponse } from "@/lib/security";
export const runtime = "nodejs";
export async function GET() {
  try {
    const { user } = await authenticated();
    await limit(user.id, "oauth", 5);
    const state = nonce(),
      verifier = nonce(),
      jar = await cookies();
    checked(
      await admin()
        .from("oauth_states")
        .insert({
          id: state,
          owner_id: user.id,
          expires_at: new Date(Date.now() + 600000).toISOString(),
        }),
    );
    jar.set(
      "atlas-google-oauth",
      seal(
        { state, verifier, userId: user.id, expires: Date.now() + 600000 },
        "oauth",
      ),
      {
        httpOnly: true,
        secure: appOrigin().startsWith("https:"),
        sameSite: "lax",
        path: "/api/oauth/google",
        maxAge: 600,
      },
    );
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      redirect_uri: `${appOrigin()}/api/oauth/google/callback`,
      response_type: "code",
      scope:
        "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    }).toString();
    return Response.redirect(url);
  } catch (e) {
    return errorResponse(e);
  }
}
