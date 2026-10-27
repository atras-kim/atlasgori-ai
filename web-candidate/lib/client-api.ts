export async function action(action: string, payload: object = {}) {
  const r = await fetch("/api/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "요청을 처리하지 못했습니다.");
  return d;
}
