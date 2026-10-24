"""Explicit opt-in local bundle sessions; fixed read-only queries, no saved tokens."""
import json
import uuid
from pathlib import Path
from urllib.request import Request, build_opener
from urllib.error import HTTPError, URLError
from zetaris import Client, ZetarisError, NoRedirect, POLICY_SQL, FIELDS

BUNDLE = Path(__file__).resolve().parents[2] / '.runtime/zetaris/zetaris-platform'
BASE = 'http://127.0.0.1:3000'


def request(path, body, headers=None):
    req = Request(BASE + path, data=json.dumps(body).encode(),
                  headers={'Content-Type': 'application/json', **(headers or {})})
    try:
        with build_opener(NoRedirect()).open(req, timeout=45) as response:
            raw = response.read(65537)
        if len(raw) > 65536: raise ValueError()
        result = json.loads(raw)
    except HTTPError as exc:
        raise ZetarisError(f'로컬 Zetaris HTTP {exc.code}. 실행 상태와 계정을 확인해 주세요.') from None
    except (URLError, OSError, ValueError):
        raise ZetarisError('로컬 Zetaris 응답을 확인하지 못했습니다.') from None
    if not isinstance(result, dict) or result.get('error') or result.get('success') is False:
        raise ZetarisError('로컬 Zetaris 요청에 실패했습니다.')
    return result


def session():
    values = {}
    try:
        for line in (BUNDLE / '.env').read_text(encoding='utf-8-sig').splitlines():
            if line.startswith(('ZETARIS_ADMIN_EMAIL=', 'ZETARIS_ADMIN_PASSWORD=')):
                key, value = line.split('=', 1)
                values[key] = value.strip().strip('\"\'')
        login = request('/api/auth/login', {'username': values['ZETARIS_ADMIN_EMAIL'],
                                          'password': values['ZETARIS_ADMIN_PASSWORD']})
    except (OSError, KeyError):
        raise ZetarisError('로컬 설치 계정 설정을 확인해 주세요.') from None
    token, org = login.get('idToken'), login.get('orgId')
    if not isinstance(token, str) or not token or '\n' in token or '\r' in token or type(org) is not int or org < 1:
        raise ZetarisError('로컬 Zetaris 로그인 응답을 확인해 주세요.')
    return {'Authorization': 'Bearer ' + token, 'X-Org-ID': str(org)}


class LocalClient(Client):
    method = 'zetaris-local-ui-proxy'

    def __init__(self):
        pass

    def _run(self, sql, limit):
        if sql not in ('SELECT 1 AS one', POLICY_SQL):
            raise ZetarisError('허용되지 않은 조회입니다.')
        request_id = str(uuid.uuid4())
        result = request('/api/proxy/query/sql/start', {'select': sql, 'pageLimit': limit},
                         {**session(), 'X-Request-ID': request_id})
        records = result.get('records')
        if str(result.get('status', '')).lower() in ('failed', 'error', 'pending', 'running', 'queued'):
            raise ZetarisError('Zetaris 조회가 완료되지 않았습니다.')
        fields = ('one',) if sql == 'SELECT 1 AS one' else FIELDS
        if not isinstance(records, list) or any(not isinstance(r, dict) or set(r) != set(fields) for r in records):
            raise ZetarisError('Zetaris 조회 결과 형식이 올바르지 않습니다.')
        rows = [[r[f] for f in fields] for r in records]
        if sql == 'SELECT 1 AS one' and rows == [['1']]: rows = [[1]]
        return rows, request_id

    def check(self):
        result = super().check()
        result['method'] = self.method
        return result
