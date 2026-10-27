import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import MailComposer from "nodemailer/lib/mail-composer";
import { simpleParser } from "mailparser";
import {
  seal,
  unseal,
  assertOrigin,
  validateDraft,
  safeUrl,
  jsonBody,
  upstreamJson,
} from "../lib/security";
import { extractSafeAttachment } from "../lib/extraction";
process.env.ATLAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.ATLAS_APP_URL = "https://atlasgori.com";
const draft = {
  accountId: randomUUID(),
  to: "buyer@example.com",
  cc: "copy@example.com",
  bcc: "private@example.com",
  subject: "견적 확인",
  body: "공급 조건을 확인해 주세요.",
  attachments: [],
};
test("credentials bind to both user and mailbox; ciphertext tampering fails", () => {
  const sealed = seal({ password: "synthetic-fixture" }, "userA:accountA");
  assert.deepEqual(unseal(sealed, "userA:accountA"), {
    password: "synthetic-fixture",
  });
  assert.throws(() => unseal(sealed, "userB:accountA"));
  assert.throws(() => unseal(sealed, "userA:accountB"));
  const parts = sealed.split(".");
  parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => unseal(parts.join("."), "userA:accountA"));
  assert.notEqual(seal("same", "a"), seal("same", "a"));
});
test("mutations reject missing and foreign origin", () => {
  assert.throws(() =>
    assertOrigin(new Request("https://atlasgori.com/api/action")),
  );
  assert.throws(() =>
    assertOrigin(
      new Request("https://atlasgori.com/api/action", {
        headers: { Origin: "https://evil.example" },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    assertOrigin(
      new Request("https://atlasgori.com/api/action", {
        headers: { Origin: "https://atlasgori.com" },
      }),
    ),
  );
});
test("draft boundary rejects header injection, malformed email and path attachments", () => {
  assert.throws(() =>
    validateDraft({ ...draft, subject: "hello\r\nBcc: evil@example.com" }),
  );
  assert.throws(() =>
    validateDraft({
      ...draft,
      to: "buyer@example.com\r\nBcc: evil@example.com",
    }),
  );
  assert.throws(() =>
    validateDraft({
      ...draft,
      attachments: [
        { name: "../secret.txt", type: "text/plain", content: "YQ==" },
      ],
    }),
  );
  assert.equal(validateDraft(draft).to[0], "buyer@example.com");
});
test("attachment budget is enforced across files", () => {
  assert.throws(() =>
    validateDraft({
      ...draft,
      attachments: [
        {
          name: "a",
          type: "text/plain",
          content: Buffer.alloc(6 * 1024 * 1024).toString("base64"),
        },
        {
          name: "b",
          type: "text/plain",
          content: Buffer.alloc(6 * 1024 * 1024).toString("base64"),
        },
      ],
    }),
  );
});
test("MIME preserves Korean body, BCC envelope and exact attachment contents", async () => {
  const node = new MailComposer({
    from: "sender@example.com",
    to: "buyer@example.com",
    bcc: "private@example.com",
    subject: draft.subject,
    text: draft.body,
    attachments: [
      { filename: "quote.txt", content: Buffer.from("USD 980 / MT") },
    ],
  }).compile();
  node.keepBcc = true;
  const raw = await node.build(),
    parsed = await simpleParser(raw);
  assert.equal(parsed.subject, draft.subject);
  assert.equal(parsed.text?.trim(), draft.body);
  assert.equal(parsed.attachments[0].content.toString(), "USD 980 / MT");
  assert.match(raw.toString(), /Bcc: private@example.com/);
});
test("external result links reject executable schemes and embedded credentials", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,test",
    "https://user:password@example.com",
  ])
    assert.throws(() => safeUrl(value));
  assert.equal(
    safeUrl("https://example.com/supplier"),
    "https://example.com/supplier",
  );
});
test("untrusted complex attachments never invoke a parser in the web process", () => {
  assert.equal(
    extractSafeAttachment("application/pdf", Buffer.from("malicious")).text,
    "",
  );
  assert.equal(
    extractSafeAttachment(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      Buffer.alloc(100),
    ).text,
    "",
  );
  assert.equal(
    extractSafeAttachment("text/csv", Buffer.from("price,980")).text,
    "price,980",
  );
  assert.equal(
    extractSafeAttachment("text/plain", Buffer.alloc(1024 * 1024 + 1)).text,
    "",
  );
});
test("streaming request budget works without Content-Length", async () => {
  await assert.rejects(
    jsonBody(
      new Request("https://atlasgori.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x: "x".repeat(100) }),
      }),
      20,
    ),
  );
});
test("upstream JSON rejects oversized streaming responses", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ raw: "x".repeat(100) }), { status: 200 }),
  );
  await assert.rejects(upstreamJson("https://example.com", {}, 20));
});
