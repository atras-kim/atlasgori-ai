import { simpleParser } from 'mailparser';
import { Account, gmailToken, imapClient } from './providers';
import { AppError, upstreamJson } from './security';
import { replyRecipient } from './reply-policy';
export function cleanReplyCc(values: string[], excluded: string[]) {
 const skip = new Set(excluded.map(v=>v.toLowerCase()));
 return values.map(v=>replyRecipient(v)).filter(v=>{const key=v.toLowerCase();if(skip.has(key))return false;skip.add(key);return true;}).join(', ');
}
export async function originalCc(account: Account, providerId: string, sender: string, ownEmails: string[]) {
 let values: string[] = [];
 if(account.provider === 'gmail') {
  const token=await gmailToken(account);
  const result=await upstreamJson<{payload?:{headers?:{name:string;value:string}[]}}>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(providerId)}?format=metadata&metadataHeaders=Cc`,{headers:{Authorization:`Bearer ${token}`}});
  const headers=result.payload?.headers || [];
  const parsed=await simpleParser(headers.filter(h=>h.name.toLowerCase()==='cc').map(h=>`Cc: ${h.value}`).join('\r\n')+'\r\n\r\n');
  const cc=parsed.cc; values=(Array.isArray(cc)?cc:[cc]).flatMap(v=>v?.value.map(a=>a.address || '') || []).filter(Boolean);
 } else {
  const parts=providerId.split(':');
  if(parts.length!==2 || !parts.every(p=>/^\d+$/.test(p)))throw new AppError('원메일 참조 주소를 확인할 수 없습니다.');
  const client=await imapClient(account);
  try {
   await client.connect(); const lock=await client.getMailboxLock('INBOX');
   try {
    if(!client.mailbox || String(client.mailbox.uidValidity)!==parts[0])throw new AppError('원메일함이 변경되어 참조 주소를 확인할 수 없습니다.');
    const mail=await client.fetchOne(Number(parts[1]),{envelope:true},{uid:true});
    if(!mail || !mail.envelope)throw new AppError('원메일을 찾지 못해 참조 주소를 확인할 수 없습니다.');
    values=(mail.envelope.cc || []).map(a=>a.address || '').filter(Boolean);
   } finally {lock.release();}
  } finally {await client.logout().catch(()=>{});}
 }
 return cleanReplyCc(values,[replyRecipient(sender),...ownEmails]);
}
