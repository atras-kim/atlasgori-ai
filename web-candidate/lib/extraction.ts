// Only bounded text formats are processed inside the web server. Complex parsers need an isolated worker.
export function extractSafeAttachment(type: string, bytes: Buffer) {
  if (bytes.length > 1024 * 1024)
    return { text: "", state: "1 MB 초과 · 텍스트 추출 제외" };
  if (["text/plain", "text/csv", "application/json"].includes(type))
    return {
      text: bytes.toString("utf8").slice(0, 12000),
      state: "텍스트 추출 완료",
    };
  return { text: "", state: "PDF·Office·이미지 추출 준비 중 · 원문 확인 필요" };
}
