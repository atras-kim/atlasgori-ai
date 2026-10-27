export const FX_REFRESH_MS = 60 * 60 * 1000;
export const FX_CURRENCIES = ['USD','EUR','JPY','CNY','GBP','CHF','CAD','AUD','SGD','HKD'] as const;
export type FxSnapshot = { rates: Record<string, number>; dates: Record<string, string>; source: string; fetchedAt: string };
export function krwRates(rows: {base: string; quote: string; rate: number; date: string}[]): Pick<FxSnapshot,'rates'|'dates'> {
  if (!Array.isArray(rows)) throw new Error('Invalid exchange rates');
  const rates: Record<string,number> = {}, dates: Record<string,string> = {};
  for (const row of rows) {
    if (!(FX_CURRENCIES as readonly string[]).includes(row.base) || row.quote !== 'KRW' || !Number.isFinite(row.rate) || row.rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
    const won = row.rate;
    if (!Number.isFinite(won)) continue;
    rates[row.base] = won; dates[row.base] = row.date;
  }
  if (!rates.USD) throw new Error('USD reference unavailable');
  return { rates, dates };
}
export function rateChange(current: number, previous?: number) {
  if (previous === undefined || !Number.isFinite(previous) || previous <= 0) return null;
  return { won: current - previous, percent: (current / previous - 1) * 100 };
}
