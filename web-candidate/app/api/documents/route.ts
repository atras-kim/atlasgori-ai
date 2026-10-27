import { z } from "zod";
import { admin, authenticated, checked, limit } from "@/lib/db";
import { AppError, assertOrigin, errorResponse, jsonBody } from "@/lib/security";
export const dynamic = "force-dynamic";
const kind = z.enum(["quote", "brochure", "contract", "review"]);
export async function GET(req: Request) {
  try {
    const { user, client } = await authenticated();
    await limit(user.id, "documents-read", 120);
    const params = new URL(req.url).searchParams;
    const project = params.get("project") === "unassigned" ? null : z.uuid().parse(params.get("project"));
    const offset = z.coerce.number().int().min(0).max(1000000).parse(params.get("offset") || "0");
    const folders = checked(await client.rpc("document_folders", { p_project: project }));
    let query = client.from("document_library").select("*", { count: "exact" });
    query = project === null ? query.is("project_id", null) : query.eq("project_id", project);
    if (params.has("kind")) query = query.eq("document_kind", kind.parse(params.get("kind")));
    if (params.has("folder")) query = query.eq("folder_key", z.string().max(400).parse(params.get("folder")));
    const files = checked(await query.order("received_at", { ascending: false }).order("id").range(offset, offset + 49));
    return Response.json({ folders: folders.data, files: files.data, total: files.count }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    assertOrigin(req);
    const { user } = await authenticated();
    await limit(user.id, "documents-write", 30);
    const input = z.object({ id: z.uuid(), kind, company: z.string().trim().max(160).regex(/^[^\x00-\x1f\x7f]*$/) }).parse(await jsonBody(req));
    if (input.kind === "brochure" && !input.company) throw new AppError("브로셔를 보관할 회사명을 입력해 주세요.");
    const result = checked(await admin().rpc("correct_document", { p_user: user.id, p_id: input.id, p_kind: input.kind, p_company: input.company }));
    if (!result.data) throw new AppError("원메일 소유자만 파일 분류를 수정할 수 있습니다.", 403);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return errorResponse(e); }
}
