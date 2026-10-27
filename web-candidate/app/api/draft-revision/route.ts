import { authenticated, ownedAccount, limit } from '@/lib/db';
import { assertOrigin, jsonBody, errorResponse, AppError } from '@/lib/security';
import { aiReady } from '@/lib/openai';
import { meteredOpenai } from '@/lib/metered-ai';
import { reviseDraft } from '@/lib/draft-revision';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  try {
    assertOrigin(req);
    const { user } = await authenticated();
    if (process.env.ATLAS_AI_PROVIDER !== 'openai' || !aiReady()) throw new AppError('OpenAI 연결 설정이 필요합니다.', 503);
    const result = await reviseDraft(await jsonBody(req, 128 * 1024), async id => {
      await ownedAccount(id, user.id);
      await limit(user.id, 'draft-revision', 5);
    }, (task, data, schema) => meteredOpenai(user.id, 'reply', task, data, schema));
    return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}
