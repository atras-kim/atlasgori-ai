import { AppError } from "./security";

// Never expose upstream responses: they may contain account or authentication data.
export function mailConnectionError(error: unknown, protocol: "IMAP" | "SMTP") {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = typeof value.code === "string" ? value.code : "";
  const stage = protocol === "IMAP" ? "수신(IMAP)" : "발신(SMTP)";
  if (value.authenticationFailed === true || code === "EAUTH" || value.responseCode === 535) {
    return new AppError(`${stage} 인증이 거절되었습니다. 메일 주소, 앱 비밀번호, 메일 서비스의 IMAP/SMTP 사용 설정을 확인해 주세요.`, 422);
  }
  if (["ETLS", "EREQUIRETLS", "ERR_TLS_CERT_ALTNAME_INVALID", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "STARTTLS_INJECTION"].includes(code)) {
    return new AppError(`${stage} 보안 연결을 확인하지 못했습니다. 네트워크 또는 메일 서버의 인증서 상태를 확인해 주세요.`, 502);
  }
  if (["CONNECT_TIMEOUT", "GREETING_TIMEOUT", "UPGRADE_TIMEOUT", "ETIMEDOUT", "ETIMEOUT", "ECONNREFUSED", "ECONNRESET", "ECONNECTION", "ENOTFOUND", "EAI_AGAIN", "ESOCKET", "NoConnection", "EConnectionClosed"].includes(code)) {
    return new AppError(`${stage} 서버에 연결하지 못했습니다. 네트워크·방화벽 또는 메일 서비스 상태를 확인한 뒤 다시 시도해 주세요.`, 502);
  }
  return new AppError(`${stage} 연결 확인에 실패했습니다. 메일 서비스의 IMAP/SMTP 설정과 앱 비밀번호를 확인해 주세요.`, 502);
}
