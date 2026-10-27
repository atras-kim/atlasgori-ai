import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
export function inspectSetup(values) {
  const results = [];
  const add = (name, ok, optional = false) => results.push({ name, status: !values[name] ? 'missing' : ok ? 'configured' : 'invalid', optional });
  let urlOK = false, originOK = false;
  try { const u = new URL(values.NEXT_PUBLIC_SUPABASE_URL); urlOK = u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash && u.pathname === '/'; } catch {}
  try { const u = new URL(values.ATLAS_APP_URL); originOK = !u.username && !u.password && !u.search && !u.hash && u.pathname === '/' && (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost','127.0.0.1'].includes(u.hostname))); } catch {}
  const keyRole = value => {
    if (value?.startsWith('sb_publishable_') && value.length > 25) return 'anon';
    if (value?.startsWith('sb_secret_') && value.length > 25) return 'service_role';
    try { if (value.split('.').length !== 3) return ''; return JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()).role; } catch { return ''; }
  };
  add('NEXT_PUBLIC_SUPABASE_URL', urlOK);
  add('NEXT_PUBLIC_SUPABASE_ANON_KEY', keyRole(values.NEXT_PUBLIC_SUPABASE_ANON_KEY) === 'anon');
  add('SUPABASE_SERVICE_ROLE_KEY', keyRole(values.SUPABASE_SERVICE_ROLE_KEY) === 'service_role');
  add('ATLAS_APP_URL', originOK);
  const key = values.ATLAS_ENCRYPTION_KEY || '';
  add('ATLAS_ENCRYPTION_KEY', /^[A-Za-z0-9+/]{43}=$/.test(key) && Buffer.from(key,'base64').length === 32);
  add('GOOGLE_CLIENT_ID', /^[\w-]+\.apps\.googleusercontent\.com$/.test(values.GOOGLE_CLIENT_ID || ''), true);
  add('GOOGLE_CLIENT_SECRET', !!values.GOOGLE_CLIENT_SECRET, true);
  return results;
}

export function initializeFile(path, template, random = () => randomBytes(32).toString('base64')) {
  // Exclusive creation is also the concurrency guard. Never replace an existing key.
  try { writeFileSync(path, template.replace(/^ATLAS_ENCRYPTION_KEY=$/m, `ATLAS_ENCRYPTION_KEY=${random()}`), { flag:'wx', mode:0o600 }); return true; }
  catch (e) { if (e.code === 'EEXIST') return false; throw e; }
}

function main() {
  const path = resolve(root,'.env.local');
  if (process.argv.includes('--init')) {
    const created = initializeFile(path, readFileSync(resolve(root,'.env.example'),'utf8'));
    console.log(created ? '로컬 설정 파일과 암호화 키를 준비했습니다. 키는 표시하지 않습니다.' : '기존 설정 파일을 유지했습니다. 암호화 키를 변경하지 않았습니다.');
  }
  // Match Next environment priority for a local production build: process > production.local > local > production > env.
  const mode = process.env.NODE_ENV || 'production';
  const values = {};
  for (const filename of ['.env',`.env.${mode}`,'.env.local',`.env.${mode}.local`]) {
    const path = resolve(root,filename);
    if (existsSync(path)) Object.assign(values,parseEnv(readFileSync(path,'utf8')));
  }
  Object.assign(values,process.env);
  console.log('ATLAS 로컬 설정 점검 — 네트워크 연결·로그인·메일 발송 없음');
  const results = inspectSetup(values);
  const labels = {configured:'형식 준비됨',missing:'누락',invalid:'형식 확인 필요'};
  for (const row of results) console.log(`${row.optional ? '[Gmail 선택]' : '[필수]'} ${row.name}: ${labels[row.status]}`);
  const ready = results.filter(r=>!r.optional).every(r=>r.status === 'configured');
  console.log(ready ? '로컬 설정 형식 준비됨. 실제 DB 연결·권한·마이그레이션·메일 인증은 아직 미검증입니다.' : '네이버 연결 준비 대기: 필수 설정을 먼저 완료해 주세요.');
  console.log('DB: 001 → 002 → 003 → 004 순서로 1회 적용 여부 확인 필요. 기존 DB에는 미적용 파일만 적용하세요.');
  console.log('AI: 계정별 외부 AI 처리 동의 전에는 활성화하지 마세요.');
  console.log('실제 발송: 발신 계정·수신자·제목·본문·첨부를 확인한 뒤 건별 승인 필요.');
  process.exitCode = ready ? 0 : 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch { console.error('설정 점검 실패: 파일 접근 권한과 환경파일 문법을 확인해 주세요. 비밀값은 출력하지 않았습니다.'); process.exitCode=1; }
}
