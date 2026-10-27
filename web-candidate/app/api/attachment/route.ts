import { z } from "zod";
import { authenticated, checked } from "@/lib/db";
import { AppError, errorResponse } from "@/lib/security";
export async function GET(req: Request) {
  try {
    const { client } = await authenticated(),
      id = z.uuid().parse(new URL(req.url).searchParams.get("id"));
    const r = checked(
      await client
        .from("attachments")
        .select("name,content_base64")
        .eq("id", id)
        .single(),
    );
    if (!r.data) throw new AppError("첨부파일에 접근할 수 없습니다.", 404);
    return new Response(Buffer.from(r.data.content_base64, "base64"), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(r.data.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
