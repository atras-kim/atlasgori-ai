import { meteredOpenai } from "@/lib/metered-ai";
import { authenticated, admin, checked, limit } from "@/lib/db";
import { assertOrigin, jsonBody, errorResponse, AppError } from "@/lib/security";
import { previewSelected, previewRequest } from "@/lib/ai-preview";
import { aiReady } from "@/lib/openai";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    assertOrigin(req);
    const { user } = await authenticated();
    const input = previewRequest.parse(await jsonBody(req));
    if (process.env.ATLAS_AI_PROVIDER !== "openai" || !aiReady()) throw new AppError("OpenAI 연결 설정이 필요합니다.", 503);
    await limit(user.id, "ai-preview", 1);
    const result = await previewSelected(input, user.id, async ids => checked(await admin()
      .from("messages").select("id,owner_id,subject,sender,body").eq("owner_id", user.id).in("id", ids)).data || [], (task, data, schema) => meteredOpenai(user.id, "preview", task, data, schema));
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
