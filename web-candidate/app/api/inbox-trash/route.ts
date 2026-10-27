import { z } from 'zod';
import { admin, authenticated, checked, limit } from '@/lib/db';
import { AppError, assertOrigin, errorResponse, jsonBody } from '@/lib/security';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const requestSchema = z.object({ id: z.uuid(), restore: z.boolean() });
export async function GET(req: Request) {
  try {
    const { user } = await authenticated();
    const page = z.coerce.number().int().min(0).max(100000).parse(new URL(req.url).searchParams.get('page') || 0);
    const result = checked(await admin().from('messages').select('*,attachments(id,name,size,type,extraction)', { count: 'exact' })
      .eq('owner_id', user.id).not('inbox_trashed_at', 'is', null)
      .order('inbox_trashed_at', { ascending: false }).order('id').range(page * 50, page * 50 + 49));
    return Response.json({ messages: result.data || [], count: result.count || 0 }, { headers });
  } catch (error) { return errorResponse(error); }
}
export async function POST(req: Request) {
  try {
    assertOrigin(req);
    const { user } = await authenticated();
    await limit(user.id, 'inbox-trash', 60);
    const { id, restore } = requestSchema.parse(await jsonBody(req));
    const result = checked(await admin().from('messages').update({ inbox_trashed_at: restore ? null : new Date().toISOString() })
      .eq('id', id).eq('owner_id', user.id).select('id'));
    if (!result.data?.length) throw new AppError('본인 계정의 메일만 정리할 수 있습니다.', 404);
    return Response.json({ ok: true }, { headers });
  } catch (error) { return errorResponse(error); }
}
