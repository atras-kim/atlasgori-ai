import { randomUUID } from "node:crypto";
import MailComposer from "nodemailer/lib/mail-composer";
import { admin, checked, ownedAccount, limit } from "./db";
import {
  AppError,
  validateDraft,
  seal,
  unseal,
  digest,
  upstreamJson,
} from "./security";
import { gmailToken, smtpClient } from "./providers";
type Prepared = ReturnType<typeof validateDraft> & {
  from: string;
  messageId: string;
};
export async function prepareSend(userId: string, input: unknown) {
  const draft = validateDraft(input),
    account = await ownedAccount(draft.accountId, userId);
  if (account.provider === "outlook")
    throw new AppError("Outlook 발신은 준비 중입니다.");
  await limit(userId, "prepare-send", 10);
  const id = randomUUID(),
    payload: Prepared = {
      ...draft,
      from: account.email,
      messageId: `<${id}@atlasgori.com>`,
    };
  checked(
    await admin()
      .from("send_intents")
      .insert({
        id,
        owner_id: userId,
        account_id: account.id,
        ciphertext: seal(payload, `send:${userId}:${id}`),
        digest: digest(payload),
        expires_at: new Date(Date.now() + 600000).toISOString(),
      }),
  );
  return {
    intentId: id,
    draft: {
      ...draft,
      to: draft.to.join(", "),
      cc: draft.cc.join(", "),
      bcc: draft.bcc.join(", "),
    },
    from: account.email,
  };
}
export async function confirmSend(userId: string, id: string) {
  await limit(userId, "send", 10);
  const db = admin();
  const intent = checked(
    await db
      .from("send_intents")
      .select("*")
      .eq("id", id)
      .eq("owner_id", userId)
      .single(),
  ).data;
  if (!intent) throw new AppError("발송 확인 요청을 찾을 수 없습니다.", 404);
  if (intent.status !== "prepared")
    throw new AppError(
      "이미 처리된 발송 요청입니다. 보낸 메일함을 확인하세요.",
      409,
    );
  if (new Date(intent.expires_at).getTime() < Date.now())
    throw new AppError(
      "발송 승인이 만료되었습니다. 내용을 다시 확인해 주세요.",
      409,
    );
  const account = await ownedAccount(intent.account_id, userId),
    payload = unseal<Prepared>(intent.ciphertext, `send:${userId}:${id}`);
  if (payload.from !== account.email || digest(payload) !== intent.digest)
    throw new AppError("발송 내용 확인에 실패했습니다.", 409);
  // Get credentials / MIME ready BEFORE claiming the one-time send, avoiding avoidable uncertain states.
  const options = {
    from: payload.from,
    to: payload.to,
    cc: payload.cc,
    bcc: payload.bcc,
    subject: payload.subject,
    text: payload.body,
    messageId: payload.messageId,
    attachments: payload.attachments.map((a) => ({
      filename: a.name,
      content: Buffer.from(a.content, "base64"),
      contentType: a.type,
    })),
    disableFileAccess: true,
    disableUrlAccess: true,
  };
  const token = account.provider === "gmail" ? await gmailToken(account) : null;
  const smtp = token ? null : await smtpClient(account);
  const node = token ? new MailComposer(options).compile() : null;
  if (node) node.keepBcc = true;
  const mime = node ? await node.build() : null;
  const claim = checked(
    await db
      .from("send_intents")
      .update({ status: "sending" })
      .eq("id", id)
      .eq("owner_id", userId)
      .eq("status", "prepared")
      .gt("expires_at", new Date().toISOString())
      .select("id"),
  );
  if (!claim.data?.length)
    throw new AppError("이미 처리되었거나 만료된 발송 요청입니다.", 409);
  try {
    let providerId: string;
    if (token && mime) {
      const result = await upstreamJson<{ id: string }>(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw: mime.toString("base64url") }),
        },
      );
      providerId = result.id;
    } else {
      const result = await smtp!.sendMail(options);
      if (result.rejected?.length) throw new Error("Partial rejection");
      providerId = result.messageId;
    }
    checked(
      await db
        .from("send_intents")
        .update({
          status: "submitted",
          provider_id: providerId,
          ciphertext: "",
        })
        .eq("id", id),
    );
    return { status: "submitted" };
  } catch {
    await db.from("send_intents").update({ status: "uncertain" }).eq("id", id);
    return { status: "uncertain" };
  } finally {
    smtp?.close();
  }
}
