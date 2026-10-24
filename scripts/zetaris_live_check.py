"""Local, read-only installation check using the shipped verify.sh UI-proxy protocol.

Reads only the issued local bundle login, retains session tokens in memory, and
prints no login response, credentials or upstream authentication error bodies.
"""
import json
import uuid
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / '.runtime/zetaris/zetaris-platform'


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None


def call(path, body=None, headers=None):
    request = Request('http://127.0.0.1:3000'+path,
                      data=json.dumps(body).encode() if body is not None else None,
                      headers={'Content-Type': 'application/json', **(headers or {})})
    with build_opener(NoRedirect()).open(request, timeout=45) as response:
        raw=response.read(1024*1024+1)
        if len(raw)>1024*1024: raise ValueError('Response too large')
        return json.loads(raw)


def find(value, names):
    if isinstance(value, dict):
        for key, item in value.items():
            if key.lower().replace('_','') in names and item is not None: return item
        for item in value.values():
            result=find(item,names)
            if result is not None: return result
    return None


def verified_one(value):
    """Job acknowledgements and boolean true are never SQL result evidence."""
    failed=False
    def visit(item):
        nonlocal failed
        if isinstance(item,dict):
            if item.get('error') or item.get('success') is False: failed=True
            if str(item.get('status','')).lower() in ('error','failed','pending','running','queued'):
                failed=True
            for child in item.values():
                if isinstance(child,(dict,list)): visit(child)
        elif isinstance(item,list):
            for child in item: visit(child)
    visit(value)
    if failed or not isinstance(value,dict): return False
    # Accept explicit tabular containers only, never metadata containing "one".
    candidates=[value.get('data'),value.get('rows'),value.get('records')]
    for key in ('data','result'):
        if isinstance(value.get(key),dict): candidates.append(value[key].get('rows'))
    for rows in candidates:
        if (isinstance(rows,list) and len(rows)==1 and isinstance(rows[0],dict)
                and set(rows[0])=={'one'}):
            number=rows[0]['one']
            # The shipped verify.sh expects JSON numeric strings from the proxy.
            return not isinstance(number,bool) and number in (1,'1')
    return False


def response_shape(value,depth=0):
    if depth>3: return type(value).__name__
    if isinstance(value,dict): return {str(k)[:60]:response_shape(v,depth+1) for k,v in list(value.items())[:30]}
    if isinstance(value,list): return [response_shape(value[0],depth+1)] if value else []
    return type(value).__name__


def main():
    values={}
    for line in (BUNDLE/'.env').read_text(encoding='utf-8-sig').splitlines():
        if line.startswith(('ZETARIS_ADMIN_EMAIL=','ZETARIS_ADMIN_PASSWORD=')):
            key,value=line.split('=',1); values[key]=value.strip().strip('\"\'')
    config=call('/api/config')
    login=call('/api/auth/login', {'username':values['ZETARIS_ADMIN_EMAIL'],
                                  'password':values['ZETARIS_ADMIN_PASSWORD']})
    token=find(login, {'idtoken','accesstoken','token','jwt'})
    org=find(login, {'orgid','organisationid','organizationid'})
    if not isinstance(token,str) or not token or org is None:
        raise ValueError('Login did not return a session token and organisation ID')
    request_id=str(uuid.uuid4())
    result=call('/api/proxy/query/sql/start', {'select':'SELECT 1 AS one','pageLimit':5},
                {'Authorization':'Bearer '+token,'X-Org-ID':str(org),'X-Request-ID':request_id})
    passed=verified_one(result)
    receipt={'ui_config_ok':isinstance(config,dict), 'authenticated':True,
             'query':'SELECT 1 AS one','request_id':request_id,'query_verified':passed,
             'verified_rows':[[1]] if passed else [], 'response_shape':response_shape(result),
             'method':'local-ui-proxy','credentials_or_tokens_saved':False}
    (ROOT / 'output/meterless-demo').mkdir(parents=True, exist_ok=True)
    (ROOT/'output/meterless-demo/zetaris-live-query.json').write_text(
        json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(receipt,ensure_ascii=True))
    if not passed: raise SystemExit(2)


if __name__=='__main__':
    try: main()
    except HTTPError as exc:
        print(json.dumps({'ok':False,'http_status':exc.code,'error':'Local Zetaris HTTP request failed'}))
        raise SystemExit(1)
    except (URLError,OSError,ValueError,KeyError):
        print(json.dumps({'ok':False,'error':'Local Zetaris not ready or response format needs review'}))
        raise SystemExit(1)
