import type { Draft, Message } from './types';
import type { PreviewResult } from './ai-preview';
import { replyDraft } from './reply-policy';
export function previewDraft(message: Message, item: PreviewResult['items'][number], mode: 'reply'|'analysis', accountId: string): Draft {
  if (message.id !== item.id) throw new Error('원메일과 분석 결과를 확인해 주세요.');
  if (mode === 'reply') {
    if (!item.reply) throw new Error('이 메일에는 답신 제안이 없습니다.');
    return replyDraft(message, item.reply.body);
  }
  return { accountId, to: '', cc: '', bcc: '', subject: `[AI 분석] ${message.subject}`, attachments: [],
    body: `AI 분석 결과 · 발송 전 내용을 확인해 주세요.\n\n원메일: ${message.subject}\n제품: ${item.product}\n회사: ${item.company}\n프로젝트: ${item.project}\n\n요약\n${item.summary}\n\n리스크\n${item.risks.join('\n') || '확인된 내용 없음'}\n\n다음 액션\n${item.actions.join('\n') || '확인된 내용 없음'}` };
}
