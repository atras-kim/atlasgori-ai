import { z } from "zod";
export const replyPresentation = "For Korean emails, distinguish 발신자, 수신자 and quoted past correspondence. Answer the latest sender request point by point in natural Korean business language. Never reverse who supplies, requests or pays. Do not ask for information already provided. If the user has not supplied an answer or decision, place that uncertainty in checks instead of fabricating approval, schedules or completed work. Use names and job titles only when explicit, and use polite -습니다/-주시겠습니까 endings without excessive honorifics. Write warm, concise and fluent business correspondence, as an experienced colleague would. Avoid literal translation, repetitive thanks, stiff boilerplate and unnecessary questions. Respond specifically to the latest message and connect sentences naturally. Use clear requests and short paragraphs; never add unsupported commitments. Start with a salutation naming the reply recipient, using only the original sender's explicit display name; if unknown use [Recipient Name] or [받는 사람 이름]. Use correct spacing and short readable paragraphs separated by blank lines. Separate greeting, body, closing and signature. End with the sending user's explicitly supplied name; if unavailable use [Your Name] or [보내는 사람 이름] 드림. Never borrow a signature from the source email or quoted history as the sending identity. When revising, preserve existing recipient and signature names unless the user explicitly requests a change.";
export const replySchema = z.object({
  body: z.string().trim().min(1).max(6000),
  reason: z.string().max(1000),
  checks: z.array(z.string().max(500)).max(6),
});
// A model never controls the envelope, attachments or sending authority.
export function replyRecipient(sender: string) {
  const candidate = sender.match(/^[^<>]*<([^<>]+)>$/)?.[1] || sender;
  const parsed = z.email().safeParse(candidate.trim());
  if (!parsed.success || /[\r\n,;]/.test(candidate)) throw new Error("원메일의 발신 주소를 확인해 주세요.");
  return parsed.data;
}
export function replyDraft(message: { id?: string; account_id: string; sender: string; subject: string }, body: string) {
  return { sourceMessageId: message.id, accountId: message.account_id, to: replyRecipient(message.sender), cc: "", bcc: "",
    subject: /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`, body, attachments: [] };
}
