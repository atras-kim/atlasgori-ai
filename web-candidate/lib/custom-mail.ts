import { Resolver } from 'node:dns/promises';
import { z } from 'zod';
import { AppError } from './security';

const hostname = z.string().trim().toLowerCase().max(253).regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);
export const customMailSchema = z.object({
  imap: hostname,
  smtp: hostname,
  port: z.union([z.literal(465), z.literal(587)]),
  username: z.string().trim().min(1).max(254).regex(/^[^\s\x00-\x1f\x7f]+$/),
});
export type CustomMail = z.infer<typeof customMailSchema>;

// Only globally routable IPv4 targets; pin the selected address at every connection.
export function publicMailIp(ip: string) {
  const parts = ip.split('.');
  if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return false;
  const [a,b,c] = parts.map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}
export async function mailTarget(host: string) {
  hostname.parse(host);
  const resolver = new Resolver({timeout:3000,tries:2});
  let addresses: string[];
  try { addresses = await resolver.resolve4(host); }
  catch { throw new AppError('메일 서버 주소를 찾을 수 없습니다. 서버 주소와 인터넷 연결을 확인해 주세요.'); }
  if (!addresses.length || addresses.some(ip => !publicMailIp(ip)))
    throw new AppError('공개 인터넷 메일 서버 주소를 입력해 주세요.');
  return addresses[0];
}
