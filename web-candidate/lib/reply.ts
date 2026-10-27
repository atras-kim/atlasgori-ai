import { originalCc } from "./reply-cc";
import { ai } from "./ai";
import { admin, checked, limit, ownedAccount } from "./db";
import { AppError } from "./security";
import { replyDraft, replySchema, replyPresentation } from "./reply-policy";
import { translateReply, translatedReply } from './reply-translation';

export async function suggestedReply(userId: string, messageId: string, accept = false, expectedBody?: string, expectedVersion?: number, cachedOnly = false, editedBody?: string) {
  const db = admin();
  const message = checked(await db.from("messages").select("*").eq("id", messageId).eq("owner_id", userId).maybeSingle()).data;
  if (!message) throw new AppError("메일 소유자만 답신을 제안받을 수 있습니다.", 403);
  const account = await ownedAccount(message.account_id, userId);
  if (!account.ai_enabled) throw new AppError("계정 설정에서 외부 AI 처리를 먼저 허용해 주세요.", 403);
  const saved = checked(await db.from("mail_assistance").select("reply,source_subject,source_body,source_version").eq("message_id", messageId).eq("owner_id", userId).maybeSingle()).data;
  if (saved?.reply && saved.source_subject === message.subject && saved.source_body === message.body && saved.source_version === message.assistance_version) {
    const reply = replySchema.parse(saved.reply);
    if (accept && (expectedBody !== reply.body || expectedVersion !== message.assistance_version)) throw new AppError("제안 내용이 변경되었습니다. 다시 확인해 주세요.", 409);
    if (accept) {
      const own = checked(await db.from("mail_accounts").select("email").eq("owner_id", userId)).data || [];
      const cc = await originalCc(account, message.provider_id, message.sender, own.map(a=>a.email));
      await limit(userId, 'reply-translation', 5);
      const translated = await translateReply(editedBody ?? reply.body, message,
        async (task, data, schema) => { const current = await ownedAccount(message.account_id, userId); if (!current.ai_enabled) throw new AppError('AI 처리 동의가 해제되었습니다.', 403); return ai(task, data, userId, 'reply', schema); });
      const latest = checked(await db.from('messages').select('assistance_version,subject,body,sender').eq('id', messageId).eq('owner_id', userId).maybeSingle()).data;
      const currentAccount = await ownedAccount(message.account_id, userId);
      if (!currentAccount.ai_enabled) throw new AppError('AI 처리 동의가 해제되었습니다.', 403);
      if (!latest || latest.assistance_version !== message.assistance_version || latest.subject !== message.subject || latest.body !== message.body || latest.sender !== message.sender) throw new AppError('원메일이 변경되었습니다. 다시 확인해 주세요.', 409);
      return { draft: {...replyDraft(message, translated.body), cc}, language: translated.language };
    }
    return { reply, version: message.assistance_version };
  }
  if (accept) throw new AppError("원메일이 변경되었거나 제안이 만료되었습니다. 다시 제안받아 주세요.", 409);
  if (cachedOnly) return {reply:null,version:message.assistance_version};
  await limit(userId, "ai", 5);
  const currentAccount = await ownedAccount(message.account_id, userId);
  if (!currentAccount.ai_enabled) throw new AppError("AI 처리 동의가 해제되었습니다.", 403);
  const reply = replySchema.parse(await ai(
    replyPresentation + ' Suggest a polite reply in Korean for the user to review. JSON {body:string,reason:string,checks:string[]}. Only acknowledge known facts and ask useful missing questions. Never commit to prices, purchases, payments or delivery; never claim to have reviewed attachments. No envelope fields. Put facts needing human confirmation in checks.',
    { subject: message.subject, sender: message.sender, body: message.body.slice(0, 10000) }, userId, "reply", replySchema,
  ));
  const stored = checked(await db.rpc("save_mail_assistance", {
    p_user: userId, p_message: messageId, p_project: null, p_name: null,
    p_product: message.product, p_company: message.company, p_reply: reply,
    p_subject: message.subject, p_body: message.body, p_sender: message.sender, p_automatic: false, p_version: message.assistance_version,
  }));
  if (!stored.data) throw new AppError("메일 또는 AI 설정이 변경되었습니다. 다시 확인해 주세요.", 409);
  // Concurrent generation always returns the stored winner, also used on acceptance.
  const winner = checked(await db.from("mail_assistance").select("reply,source_version").eq("message_id", messageId).eq("owner_id", userId).maybeSingle()).data;
  if (!winner || winner.source_version !== message.assistance_version) throw new AppError("메일이 변경되었습니다. 다시 제안받아 주세요.", 409);
  return { reply: replySchema.parse(winner.reply), version: winner.source_version };
}
