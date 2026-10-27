import { db,admin,checked } from "@/lib/db";
import {
  assertOrigin,
  jsonBody,
  errorResponse,
  AppError,
  address,
} from "@/lib/security";
const attempts = new Map<string, { count: number; until: number }>();
export async function POST(req: Request) {
  try {
    assertOrigin(req);
    const body = await jsonBody(req, 10000),
      client = await db();
    if (body.mode === "logout") {
      await client.auth.signOut();
      return Response.json({ ok: true });
    }
    const email = address.parse(body.email),
      previous = attempts.get(email);
    if (previous && previous.until > Date.now() && previous.count >= 10)
      throw new AppError("잠시 후 로그인해 주세요.", 429);
    attempts.set(email, {
      count: previous && previous.until > Date.now() ? previous.count + 1 : 1,
      until: Date.now() + 60000,
    });
    if (attempts.size > 10000) attempts.clear();
    if (typeof body.password !== "string" || body.password.length > 500)
      throw new AppError("비밀번호를 확인해 주세요.");
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password: body.password,
    });
    if (error) throw new AppError("이메일 또는 비밀번호를 확인해 주세요.", 401);
    const member=checked(await admin().from('app_members').select('state').eq('id',data.user.id).maybeSingle()).data;
    if(!member||member.state!=='active'){await client.auth.signOut();throw new AppError('이용이 정지되었거나 가입 승인이 필요합니다.',403);}
    checked(await admin().from('member_audit').insert({actor_id:data.user.id,member_id:data.user.id,action:'login'}));
    attempts.delete(email);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
