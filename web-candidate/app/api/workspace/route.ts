import { authenticated, checked, admin } from "@/lib/db";
import { aiReady } from "@/lib/openai";
import { errorResponse } from "@/lib/security";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { client, user } = await authenticated();
    const [a, m, p, c] = await Promise.all([
      client
        .from("mail_accounts")
        .select("id,email,provider,last_synced_at,ai_enabled,automation_enabled,backfill_cursor")
        .order("created_at"),
      client
        .from("messages")
        .select("*,attachments(id,name,size,type,extraction)")
        .is("inbox_trashed_at", null)
        .order("received_at", { ascending: false })
        .limit(250),
      client
        .from("projects")
        .select("*")
        .order("updated_at", { ascending: false }),
      client
        .from("source_candidates")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    for (const r of [a, m, p, c]) checked(r);
    return Response.json(
      {
        accounts: a.data,
        messages: m.data,
        projects: p.data,
        candidates: c.data,
        userId: user.id,
        email: user.email,
        isOperator: !!checked(await admin().from('app_members').select('is_operator').eq('id',user.id).single()).data?.is_operator,
        aiReady: aiReady(),
        aiProvider: process.env.ATLAS_AI_PROVIDER || "disabled",
        searchReady: !!(process.env.BRAVE_SEARCH_API_KEY || process.env.OPENAI_API_KEY),
        gmailReady: !!(
          process.env.GOOGLE_CLIENT_ID &&
          process.env.GOOGLE_CLIENT_SECRET &&
          process.env.ATLAS_ENCRYPTION_KEY
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
