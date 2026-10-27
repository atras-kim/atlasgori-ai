import { randomUUID } from "node:crypto";
import { env, safeUrl, upstreamJson } from "./security";
import type { Candidate } from "./types";
import { searchOpenai } from "./sourcing-openai";
export async function source(query: string, ownerId: string) {
  if (!process.env.BRAVE_SEARCH_API_KEY) return searchOpenai(query, ownerId);
  const requested = Math.min(
    100,
    Number(query.match(/(\d+)\s*(곳|개|companies|suppliers)/i)?.[1] || 20),
  );
  const clean = query
    .replace(/\d+\s*(곳|개|companies|suppliers)/gi, "")
    .replace(/찾아\s*줘|검색해\s*줘/g, "")
    .trim();
  const results: Candidate[] = [];
  const domains = new Set<string>();
  for (let page = 0; page < Math.ceil(requested / 20); page++) {
    const params = new URLSearchParams({
      q: clean,
      count: "20",
      offset: String(page),
      safesearch: "moderate",
    });
    const data = await upstreamJson<{
      web?: { results?: { title: string; url: string; description: string }[] };
      query?: { more_results_available: boolean };
    }>(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: {
        "X-Subscription-Token": env("BRAVE_SEARCH_API_KEY"),
        Accept: "application/json",
      },
    });
    for (const r of data.web?.results || []) {
      try {
        const url = safeUrl(r.url),
          host = new URL(url).hostname.replace(/^www\./, "");
        if (domains.has(host)) continue;
        domains.add(host);
        results.push({
          id: randomUUID(),
          name: r.title.slice(0, 300),
          url,
          description: r.description.replace(/<[^>]+>/g, "").slice(0, 1500),
        });
      } catch {
        /* Invalid result links are excluded. */
      }
    }
    if (!data.query?.more_results_available || results.length >= requested)
      break;
  }
  return { results: results.slice(0, requested) };
}
