import { upstreamJson, errorResponse, AppError } from "@/lib/security";
import { FX_CURRENCIES, krwRates } from '@/lib/fx';
let cached: { expires: number; value: unknown } | null = null;
export async function GET() {
  try {
    if (cached && cached.expires > Date.now())
      return Response.json(cached.value);
    const rows = await Promise.all(FX_CURRENCIES.map(base => upstreamJson<{base: string; quote: string; rate: number; date: string}>(`https://api.frankfurter.dev/v2/rate/${base}/KRW`)));
    let converted;
    try { converted = krwRates(rows); } catch { throw new AppError('환율을 불러오지 못했습니다.', 502); }
    const value = {
      ...converted,
      source: "Frankfurter",
      kind: "daily-reference",
      fetchedAt: new Date().toISOString(),
    };
    cached = { expires: Date.now() + 300000, value };
    return Response.json(value);
  } catch (e) {
    return errorResponse(e);
  }
}
