"""Read-only Zetaris adapters. Credentials never leave the server response boundary.

Protocol: zetaris/getting-started scripts/zetaris_sql.py (REST channel).
No arbitrary SQL, writes or redirects. Local bundle sessions require explicit opt-in.
"""
import json
import math
import os
import re
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

ENV_PATH = Path(__file__).resolve().parents[2] / 'config' / 'zetaris.env.local'
FIELDS = ('quantity_mt', 'shipment_days_max', 'deposit_percent_max', 'mfr', 'mfr_tolerance')
REQUIRED = ('ZETARIS_REST_URL', 'ZETARIS_ORG_ID', 'ZETARIS_API_KEY')
POLICY_SQL = ('SELECT quantity_mt, shipment_days_max, deposit_percent_max, mfr, mfr_tolerance '
              "FROM atlasgori_policy.buyer_criteria WHERE policy_id = 'PP_BUSAN_DEMO' LIMIT 2")


class ZetarisError(ValueError):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def settings():
    values = {}
    if ENV_PATH.is_file():
        for line in ENV_PATH.read_text(encoding='utf-8-sig').splitlines():
            match = re.fullmatch(r'(ZETARIS_[A-Z_]+)=(.*)', line.strip())
            if match:
                values[match[1]] = match[2].strip().strip('\"\'')
    for key in (*REQUIRED, 'ZETARIS_MODE'):
        if key in os.environ:
            values[key] = os.environ[key]
    return values


def configured():
    if settings().get('ZETARIS_MODE') == 'local-bundle':
        return {'configured': True, 'connected': False, 'missing': [],
                'message': '로컬 Zetaris 설정됨 · 구매 기준 조회 가능'}
    missing = [key for key in REQUIRED if not settings().get(key)]
    return {'configured': not missing, 'connected': False, 'missing': missing,
            'message': 'Zetaris 접속 설정이 필요합니다.' if missing else '접속 설정 있음 · 실제 연결 시험 전'}


class Client:
    def __init__(self, values=None):
        values = settings() if values is None else values
        if any(not values.get(key) for key in REQUIRED):
            raise ZetarisError('Zetaris 주소·조직 ID·API 키 설정이 필요합니다. 키는 채팅에 보내지 마세요.')
        self.base = values['ZETARIS_REST_URL'].rstrip('/')
        parsed = urlparse(self.base)
        local = parsed.hostname in ('127.0.0.1', 'localhost', '::1')
        if (parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username
                or parsed.password or parsed.query or parsed.fragment or parsed.path != '/api/v1.0'
                or (parsed.scheme == 'http' and not local)):
            raise ZetarisError('Zetaris 주소는 HTTPS와 /api/v1.0 경로가 필요합니다. 로컬만 HTTP를 허용합니다.')
        self.org = values['ZETARIS_ORG_ID']
        self.key = values['ZETARIS_API_KEY']
        if not re.fullmatch(r'[1-9][0-9]*', self.org) or any(c in self.key for c in '\r\n'):
            raise ZetarisError('Zetaris 조직 ID 또는 키 형식을 확인해 주세요.')

    def _run(self, sql, limit):
        request_id = str(uuid.uuid4())
        body = {'queryId': str(uuid.uuid4()), 'sql': sql, 'source': 'SqlEditor', 'limit': limit}
        req = Request(self.base + '/sql-editor/sqls/run', data=json.dumps(body).encode(),
                      method='POST', headers={'Authorization': 'Bearer ' + self.key,
                      'X-Org-ID': self.org, 'X-Request-ID': request_id, 'Content-Type': 'application/json'})
        try:
            with build_opener(NoRedirect()).open(req, timeout=15) as response:
                raw = response.read(65537)
            if len(raw) > 65536:
                raise ZetarisError('Zetaris 응답 크기 제한을 초과했습니다.')
            result = json.loads(raw)
        except HTTPError as exc:
            # Never expose upstream bodies, URLs, reflected keys or login material.
            raise ZetarisError(f'Zetaris HTTP {exc.code}. 계정 권한과 API 주소를 확인해 주세요.') from None
        except (URLError, OSError):
            raise ZetarisError('Zetaris 서버에 연결하지 못했습니다. 실행 환경과 주소를 확인해 주세요.') from None
        except (ValueError, UnicodeError):
            raise ZetarisError('Zetaris 응답을 읽지 못했습니다.') from None
        if not isinstance(result, dict) or result.get('error') or not isinstance(result.get('data'), list):
            raise ZetarisError('Zetaris SQL 실행 결과 형식이 올바르지 않습니다.')
        return result['data'], request_id

    def check(self):
        rows, request_id = self._run('SELECT 1 AS one', 1)
        if (rows != [[1]] or isinstance(rows[0][0], bool)
                or not isinstance(rows[0][0], (int, float))):
            raise ZetarisError('Zetaris SELECT 1 결과 검증에 실패했습니다.')
        return {'configured': True, 'connected': True, 'message': 'Zetaris 실제 SQL 연결 확인 완료',
                'query': 'SELECT 1 AS one', 'request_id': request_id, 'method': 'zetaris-rest'}

    def policy(self):
        rows, request_id = self._run(POLICY_SQL, 2)
        if len(rows) != 1 or not isinstance(rows[0], list) or len(rows[0]) != len(FIELDS):
            raise ZetarisError('구매 기준 PP_BUSAN_DEMO가 정확히 1행이어야 합니다. 데이터 등록 상태를 확인해 주세요.')
        criteria = {}
        for key, value in zip(FIELDS, rows[0]):
            if isinstance(value, bool):
                raise ZetarisError('Zetaris 구매 기준에 잘못된 숫자가 있습니다.')
            try:
                number = float(value)
            except (ValueError, TypeError):
                raise ZetarisError('Zetaris 구매 기준에 잘못된 숫자가 있습니다.') from None
            if not math.isfinite(number) or not 0 <= number <= 100000:
                raise ZetarisError('Zetaris 구매 기준 숫자의 범위를 확인해 주세요.')
            if key not in ('deposit_percent_max', 'mfr_tolerance') and number == 0:
                raise ZetarisError('수량·납기·MFR은 0보다 커야 합니다.')
            criteria[key] = number
        if criteria['deposit_percent_max'] > 100:
            raise ZetarisError('선금 한도는 100% 이하여야 합니다.')
        return {'criteria': criteria, 'source': getattr(self, 'method', 'zetaris-rest'), 'policy_id': 'PP_BUSAN_DEMO',
                'query': POLICY_SQL, 'request_id': request_id}


def get_client():
    if settings().get('ZETARIS_MODE') == 'local-bundle':
        from zetaris_local import LocalClient
        return LocalClient()
    return Client()


if __name__ == '__main__':
    try:
        print(json.dumps(Client().check(), ensure_ascii=False))
    except ZetarisError as exc:
        print(json.dumps({'connected': False, 'error': str(exc)}, ensure_ascii=False))
        raise SystemExit(1)
