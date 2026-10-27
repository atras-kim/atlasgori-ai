import { z } from "zod";
import { AppError } from "./security";
import { replySchema, replyPresentation } from "./reply-policy";
export const previewRequest = z.object({
  consent: z.literal(true),
  messageIds: z.array(z.uuid()).min(1).max(3).refine(ids => new Set(ids).size === ids.length),
});
export const previewResult = z.object({ items: z.array(z.object({
  id: z.uuid(), product: z.string().max(200), company: z.string().max(200),
  project: z.string().max(120), summary: z.string().max(2000),
  risks: z.array(z.string().max(500)).max(6), actions: z.array(z.string().max(500)).max(6),
  reply: replySchema.nullable(),
})).min(1).max(3) });
export type PreviewResult = z.infer<typeof previewResult>;
export type PreviewMessage = { id: string; owner_id: string; subject: string; sender: string; body: string };
export async function previewSelected(input: unknown, owner: string,
  fetchMessages: (ids: string[]) => Promise<PreviewMessage[]>,
  generate: (task: string, data: unknown, schema?: Record<string, unknown>) => Promise<unknown>) {
  const { messageIds } = previewRequest.parse(input);
  const rows = await fetchMessages(messageIds);
  if (rows.length !== messageIds.length || new Set(rows.map(r => r.id)).size !== rows.length ||
      rows.some(r => r.owner_id !== owner || !messageIds.includes(r.id)))
    throw new AppError("선택한 메일에 접근할 수 없습니다.", 403);
  const messages = rows.map(r => ({ id: r.id, subject: r.subject.slice(0, 1000), sender: r.sender.slice(0, 500), body: r.body.slice(0, 10000) }));
  // IDs are validated locally; avoid provider-specific UUID format support.
  const schema = JSON.parse(JSON.stringify(z.toJSONSchema(previewResult), (key, value) => key === '$schema' || key === 'format' ? undefined : value));
  const generateWithSchema = (task: string, data: unknown) => generate(task + ' Required JSON Schema: ' + JSON.stringify(schema), data, schema);
  const generated = await generateWithSchema(
    replyPresentation + ' For each supplied email return JSON {items:[{id,product,company,project,summary,risks:string[],actions:string[],reply:{body,reason,checks:string[]}|null}]}. Include each id exactly once. Write project, summary, risks, actions, reply.reason and reply.checks in Korean regardless of source language. Only reply.body should use the sender language. Preserve product and company proper names. Never invent a sender signature; use [Your Name] instead of borrowing a signature from quoted history. Suggest product/company/project without inventing facts. Label uncertain classification 검토 필요. Summarize only this email, including known quotes, currency and changes. Attachment contents are NOT supplied: never claim to review them. For spam/newsletters/non-business mail set reply=null. Otherwise draft a polite reply in sender language, without committing to prices/orders/payment/delivery. Put unknowns in checks. This is preview only; no actions are performed.',
    { messages },
  );
  const parsed = previewResult.safeParse(generated);
  if (!parsed.success) {
    const fields = parsed.error.issues.map(issue => issue.path.join('.')).join(', ');
    throw new AppError(`AI 분석 결과의 형식이 맞지 않습니다 (${fields}). 메일 선택이나 입력의 문제가 아닙니다.`, 502);
  }
  const result = parsed.data;
  if (result.items.length !== messageIds.length || new Set(result.items.map(r => r.id)).size !== messageIds.length || result.items.some(r => !messageIds.includes(r.id)))
    throw new AppError("AI 응답의 메일 근거가 일치하지 않습니다.", 502);
  return result;
}
