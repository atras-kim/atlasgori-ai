import { randomUUID } from "node:crypto";
import { simpleParser } from "mailparser";
import { admin, checked } from "./db";
import { AppError, upstreamJson } from "./security";
import { Account, gmailToken, imapClient } from "./providers";
const MAX_MESSAGE = 15 * 1024 * 1024;
async function saveRaw(
  account: Account,
  providerId: string,
  raw: Buffer,
  unread: boolean,
) {
  if (raw.length > MAX_MESSAGE) return false;
  const mail = await simpleParser(raw, {
    skipHtmlToText: false,
    skipTextToHtml: true,
    maxHtmlLengthToParse: 1000000,
  });
  const old = checked(
    await admin()
      .from("messages")
      .select("id")
      .eq("account_id", account.id)
      .eq("provider_id", providerId)
      .maybeSingle(),
  );
  if (old.data) {
    checked(
      await admin().from("messages").update({ unread }).eq("id", old.data.id),
    );
  }
  const id = old.data?.id || randomUUID();
  const to = Array.isArray(mail.to)
    ? mail.to.flatMap((a) => a.value.map((v) => v.address || ""))
    : mail.to?.value.map((v) => v.address || "") || [];
  const record = {
    id,
    account_id: account.id,
    owner_id: account.owner_id,
    provider_id: providerId,
    subject: mail.subject || "(제목 없음)",
    sender: mail.from?.text || "",
    to,
    body: (mail.text || "(텍스트 본문 없음)").slice(0, 500000),
    received_at: (mail.date && !isNaN(mail.date.getTime())
      ? mail.date
      : new Date()
    ).toISOString(),
    unread,
  };
  if (!old.data) checked(await admin().from("messages").insert(record));
  for (const [index, a] of mail.attachments.entries()) {
    if (a.size > 10 * 1024 * 1024) continue;
    checked(
      await admin()
        .from("attachments")
        .upsert({
          message_id: id,
          name: `${index + 1}-${(a.filename || "attachment").replace(/[\\/\r\n\0]/g, "_").slice(0, 180)}`,
          size: a.size,
          type: a.contentType,
          content_base64: a.content.toString("base64"),
          extraction: "AI 처리 동의 후 추출",
        }, { onConflict: "message_id,name", ignoreDuplicates: true }),
    );
  }
  return !old.data;
}
export async function syncAccount(account: Account, backfill = false) {
  const db = admin(),
    now = Date.now();
  // Atomically lease this account to avoid conflicting cursor updates and duplicate inserts.
  const lease = checked(
    await db
      .from("mail_accounts")
      .update({ sync_until: new Date(now + 180000).toISOString() })
      .eq("id", account.id)
      .or(`sync_until.is.null,sync_until.lt.${new Date(now).toISOString()}`)
      .select("id"),
  );
  if (!lease.data?.length)
    throw new AppError(
      "이 계정은 이미 동기화 중입니다. 잠시 후 다시 시도해 주세요.",
      409,
    );
  let count = 0,
    cursor: string | null = null;
  const deadline = Date.now() + 90000;
  try {
    if (account.provider === "gmail") {
      const token = await gmailToken(account),
        headers = { Authorization: `Bearer ${token}` };
      const params = new URLSearchParams({
        maxResults: "25",
        labelIds: "INBOX",
      });
      if (backfill && account.backfill_cursor)
        params.set("pageToken", account.backfill_cursor);
      const list = await upstreamJson<{
        messages?: { id: string }[];
        nextPageToken?: string;
      }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`, {
        headers,
      });
      for (const m of list.messages || []) {
        if (Date.now() > deadline)
          throw new AppError(
            "이번 동기화 시간이 초과되었습니다. 다시 동기화하면 이어서 가져옵니다.",
            408,
          );
        const base = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}`;
        const metadata = await upstreamJson<{
          sizeEstimate: number;
          labelIds?: string[];
        }>(`${base}?format=minimal`, { headers });
        if (metadata.sizeEstimate > MAX_MESSAGE) continue;
        const full = await upstreamJson<{ raw: string }>(
          `${base}?format=raw`,
          { headers },
          MAX_MESSAGE * 1.4 + 65536,
        );
        if (
          await saveRaw(
            account,
            m.id,
            Buffer.from(full.raw, "base64url"),
            metadata.labelIds?.includes("UNREAD") || false,
          )
        )
          count++;
      }
      cursor = list.nextPageToken || null;
    } else if (account.provider === "outlook") {
      throw new AppError("Outlook 연결은 준비 중입니다.", 501);
    } else {
      const imap = await imapClient(account);
      await imap.connect();
      try {
        const lock = await imap.getMailboxLock("INBOX");
        try {
          const mailbox = imap.mailbox;
          if (!mailbox) throw new AppError("받은 메일함을 열 수 없습니다.");
          const validity = String(mailbox.uidValidity);
          const parsed = account.backfill_cursor?.split(":");
          const upper =
            backfill && parsed?.[0] === validity
              ? Number(parsed[1])
              : Number(mailbox.uidNext) - 1;
          if (upper > 0) {
            const lower = Math.max(1, upper - 999),
              uids = (
                (await imap.search(
                  { uid: `${lower}:${upper}` },
                  { uid: true },
                )) || []
              )
                .slice(-25)
                .reverse();
            for (const uid of uids) {
              if (Date.now() > deadline)
                throw new AppError(
                  "동기화 시간 초과입니다. 다시 시도해 주세요.",
                  408,
                );
              const meta = await imap.fetchOne(
                uid,
                { flags: true, size: true },
                { uid: true },
              );
              if (!meta || !meta.size || meta.size > MAX_MESSAGE) continue;
              const download = await imap.download(uid, undefined, {
                uid: true,
                maxBytes: MAX_MESSAGE + 1,
              });
              if (!("content" in download) || !download.content) continue;
              const chunks: Buffer[] = [];
              let bytes = 0;
              for await (const chunk of download.content) {
                bytes += chunk.length;
                if (bytes > MAX_MESSAGE) {
                  download.content.destroy();
                  break;
                }
                chunks.push(chunk);
              }
              if (
                bytes <= MAX_MESSAGE &&
                bytes === meta.size &&
                (await saveRaw(
                  account,
                  `${validity}:${uid}`,
                  Buffer.concat(chunks),
                  !meta.flags?.has("\\Seen"),
                ))
              )
                count++;
            }
            const next = (uids.length === 25 ? Math.min(...uids) : lower) - 1;
            if (next > 0) cursor = `${validity}:${next}`;
          }
        } finally {
          lock.release();
        }
      } finally {
        await imap.logout().catch(() => {});
      }
    }
    const updates: Record<string, unknown> = {
      last_synced_at: new Date().toISOString(),
    };
    if (backfill || !account.backfill_cursor) updates.backfill_cursor = cursor;
    checked(
      await db.from("mail_accounts").update(updates).eq("id", account.id),
    );
    return { count, hasMore: !!cursor };
  } finally {
    await db
      .from("mail_accounts")
      .update({ sync_until: null })
      .eq("id", account.id);
  }
}
