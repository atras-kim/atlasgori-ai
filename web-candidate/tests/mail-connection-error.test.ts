import { test } from "node:test";
import assert from "node:assert/strict";
import { mailConnectionError } from "../lib/mail-connection-error";

test("authentication failures identify the protocol without echoing provider data", () => {
  for (const error of [{ authenticationFailed: true }, { code: "EAUTH" }, { responseCode: 535 }]) {
    const result = mailConnectionError({ ...error, message: "secret-password", response: "private-email" }, "SMTP");
    assert.equal(result.status, 422);
    assert.match(result.message, /발신\(SMTP\) 인증/);
    assert.doesNotMatch(result.message, /secret-password|private-email/);
  }
});
test("network failure does not blame credentials", () => {
  const result = mailConnectionError({ code: "ETIMEDOUT" }, "IMAP");
  assert.equal(result.status, 502);
  assert.match(result.message, /수신\(IMAP\).*네트워크/);
  assert.doesNotMatch(result.message, /인증이 거절/);
});
test("unknown upstream errors and non-error values are sanitized", () => {
  for (const error of [null, "secret-password", new Error("private-email"), { response: "secret" }]) {
    const result = mailConnectionError(error, "IMAP");
    assert.match(result.message, /수신\(IMAP\)/);
    assert.doesNotMatch(result.message, /secret|private-email/);
  }
});
