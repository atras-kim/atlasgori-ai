"""Loopback-only upload demo. No uploads are written to disk."""
import base64, hashlib, io, json, os, secrets, shutil, subprocess, threading, time, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from validation import validate_document, compare
from zetaris import get_client as ZetarisClient, ZetarisError, configured as zetaris_configured

ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[1]
PORT=int(os.environ.get('ATLASGORI_PORT','8768'))
TOKEN=secrets.token_urlsafe(32)
_bundled_node=Path(os.environ.get('LOCALAPPDATA', ''))/'Nightshift/node/node.exe'
NODE=Path(os.environ.get('ATLASGORI_NODE') or (str(_bundled_node) if _bundled_node.is_file() else shutil.which('node') or 'node'))
JOBS={}; LOCK=threading.Lock(); WORK=threading.Lock()
MAX_BODY=14*1024*1024

def node(doc=None):
    result=subprocess.run([str(NODE),str(ROOT/'meterless.mjs')]+(['--health'] if doc is None else []),input=json.dumps(doc) if doc else None,text=True,encoding='utf-8',capture_output=True,timeout=115)
    try: data=json.loads(result.stdout)
    except Exception: raise ValueError('Meterless 실행기 응답을 읽지 못했습니다. 앱 실행 상태를 확인해 주세요.')
    if not data.get('ok'): raise ValueError(data.get('error','Meterless 연결 오류'))
    return data

def extract(name, encoded):
    # Filename never becomes a filesystem path.
    name=Path(name.replace('\\','/')).name[:120]
    if not name.lower().endswith('.pdf'): raise ValueError('PDF 파일만 업로드할 수 있습니다.')
    try: content=base64.b64decode(encoded,validate=True)
    except Exception: raise ValueError('파일 인코딩이 잘못되었습니다.')
    if not content.startswith(b'%PDF-') or len(content)>3*1024*1024: raise ValueError('유효한 PDF(파일당 3 MB 이하)가 필요합니다.')
    # Isolate PDF parsing so malformed/compressed input has a bounded lifetime.
    child=subprocess.run([os.sys.executable,str(ROOT/'extract.py')],input=content,capture_output=True,timeout=20)
    if child.returncode: raise ValueError(child.stdout.decode('utf-8','replace')[:300] or 'PDF를 읽지 못했습니다.')
    pages=json.loads(child.stdout)
    return {'name':name,'sha256':hashlib.sha256(content).hexdigest(),'pages':pages}

def criteria_values(data):
    defaults={'quantity_mt':20,'shipment_days_max':21,'deposit_percent_max':30,'mfr':12,'mfr_tolerance':2}
    for k,default in defaults.items():
        value=data.get(k,default)
        if isinstance(value,bool) or not isinstance(value,(int,float)) or not 0<=value<=100000: raise ValueError('비교 기준은 유효한 숫자여야 합니다.')
        if k not in ['deposit_percent_max','mfr_tolerance'] and value==0: raise ValueError('수량·납기·MFR은 0보다 커야 합니다.')
        defaults[k]=value
    if defaults['deposit_percent_max']>100: raise ValueError('선금 한도는 100% 이하여야 합니다.')
    return defaults

def resolve_criteria(data):
    source = data.get('criteria_source', 'manual')
    if source == 'zetaris':
        policy = ZetarisClient().policy()
        policy['fetched_at_utc'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        policy['criteria_sha256'] = hashlib.sha256(json.dumps(policy['criteria'], sort_keys=True).encode()).hexdigest()
        return criteria_values(policy['criteria']), policy
    if source != 'manual': raise ValueError('구매 기준 출처가 올바르지 않습니다.')
    return criteria_values(data.get('criteria', {})), {'source': 'manual'}


def run_job(job_id, files, criteria, provenance=None):
    job=JOBS[job_id]
    try:
        node()
        records=[];receipts=[]
        for i,item in enumerate(files):
            job.update(stage=f'{i+1}/{len(files)} PDF 원문 읽기',progress=10+int(i/len(files)*75))
            doc=extract(item['name'],item['data'])
            job['stage']=f'{i+1}/{len(files)} Meterless 분석 중: {doc["name"]}'
            result=node(doc)
            job['stage']=f'{i+1}/{len(files)} 원문·숫자·조건 검증 중'
            records.append(validate_document(doc,result['fields'],criteria));receipts.append(result['receipt'])
        result={'run_id':job_id,'created_kst':time.strftime('%Y-%m-%d %H:%M:%S',time.gmtime(time.time()+9*3600)),'criteria':criteria,'records':records,'recommended_files':compare(records),'receipts':receipts,'scope':'상품 + 해상운임 + 보험. 관세·VAT·통관·도착항 현지비용·국내운송 제외. 선적일은 부산 도착일이 아닙니다.','method':'Meterless 모델 추출 → 원문 라벨 대조 → 금액 계산·거래 조건 규칙 → 비교표. 원문 라벨 미지원·누락·상충 시 확인 필요.'}
        result['criteria_provenance'] = provenance or {'source': 'manual'}
        job.update(status='done',progress=100,stage='분석·검증 완료',result=result)
    except subprocess.TimeoutExpired:
        job.update(status='error',stage='처리 시간 초과. 더 짧은 PDF로 재시도해 주세요.')
    except Exception as exc:
        job.update(status='error',stage=str(exc)[:350])
    finally: WORK.release()

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def reply(self,status,data,ctype='application/json; charset=utf-8'):
        body=data.encode('utf-8') if isinstance(data,str) else json.dumps(data,ensure_ascii=False).encode('utf-8')
        self.send_response(status);self.send_header('Content-Type',ctype);self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers();self.wfile.write(body)
    def valid_host(self): return self.headers.get('Host') in {f'127.0.0.1:{PORT}',f'localhost:{PORT}'}
    def authorized(self):
        origin=self.headers.get('Origin')
        return self.valid_host() and self.headers.get('X-Demo-Token')==TOKEN and (not origin or origin in {f'http://127.0.0.1:{PORT}',f'http://localhost:{PORT}'})
    def do_GET(self):
        if not self.valid_host(): return self.reply(403,{'error':'Host not allowed'})
        path=urlparse(self.path).path
        if path=='/': return self.reply(200,(ROOT/'index.html').read_text(encoding='utf-8').replace('__TOKEN__',TOKEN),'text/html; charset=utf-8')
        if path in ['/app.js','/style.css']:
            return self.reply(200,(ROOT/path[1:]).read_text(encoding='utf-8'),'text/javascript; charset=utf-8' if path.endswith('.js') else 'text/css; charset=utf-8')
        if not self.authorized(): return self.reply(403,{'error':'이 페이지를 새로 열어 주세요.'})
        if path=='/api/zetaris/status': return self.reply(200,zetaris_configured())
        if path in ['/api/zetaris/check','/api/zetaris/policy']:
            try:
                client=ZetarisClient()
                return self.reply(200,client.check() if path.endswith('/check') else client.policy())
            except ZetarisError as exc: return self.reply(503,{'connected':False,'error':str(exc)})
        if path=='/api/health':
            try: return self.reply(200,node())
            except Exception as exc: return self.reply(503,{'error':str(exc)[:250]})
        if path=='/api/samples':
            files=[]
            for letter in 'ABC':
                p=REPO/'output/pdf'/f'Demo_Supplier_{letter}_Quotation.pdf'
                files.append({'name':p.name,'data':base64.b64encode(p.read_bytes()).decode('ascii')})
            return self.reply(200,{'files':files})
        if path.startswith('/api/jobs/'):
            with LOCK: job=JOBS.get(path.split('/')[-1])
            return self.reply(200,job) if job else self.reply(404,{'error':'분석 기록이 만료되었습니다.'})
        self.reply(404,{'error':'Not found'})
    def do_POST(self):
        if not self.authorized(): return self.reply(403,{'error':'요청 출처 확인 실패. 페이지를 새로 열어 주세요.'})
        if self.path!='/api/analyze': return self.reply(404,{'error':'Not found'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=MAX_BODY: return self.reply(413,{'error':'전체 업로드 용량 초과'})
            if self.headers.get('Content-Type','').split(';')[0]!='application/json': return self.reply(415,{'error':'JSON required'})
            self.connection.settimeout(20)
            data=json.loads(self.rfile.read(size)); files=data.get('files')
            if not isinstance(files,list) or not 1<=len(files)<=3: raise ValueError('PDF는 1~3개 선택해 주세요.')
            if any(not isinstance(f,dict) or not isinstance(f.get('name'),str) or not isinstance(f.get('data'),str) or len(f['data'])>4200000 for f in files): raise ValueError('파일 형식 또는 용량 오류')
            if len({f['name'] for f in files})!=len(files): raise ValueError('동일한 파일명은 구분해 주세요.')
            criteria, provenance=resolve_criteria(data)
            if not WORK.acquire(blocking=False): return self.reply(409,{'error':'다른 분석이 진행 중입니다. 완료 후 다시 시도해 주세요.'})
            job_id=uuid.uuid4().hex
            with LOCK:
                for key in list(JOBS):
                    if time.time()-JOBS[key]['started']>1200: del JOBS[key]
                while len(JOBS)>=20: del JOBS[next(iter(JOBS))]
                JOBS[job_id]={'status':'running','stage':'Meterless 연결 확인 중','progress':2,'started':time.time()}
            threading.Thread(target=run_job,args=(job_id,files,criteria,provenance),daemon=True).start()
            self.reply(202,{'job_id':job_id})
        except ZetarisError as exc: self.reply(503,{'error':str(exc)[:250]})
        except (ValueError,TypeError,KeyError) as exc: self.reply(400,{'error':str(exc)[:250]})

if __name__=='__main__':
    print(f'AtlasGori PDF demo: http://127.0.0.1:{PORT}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
