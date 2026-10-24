"""End-to-end API tests against the local demo, including new PDF bytes."""
import base64,io,json,re,time,urllib.request,urllib.error
from pathlib import Path
from reportlab.pdfgen import canvas
BASE='http://127.0.0.1:8768'
page=urllib.request.urlopen(BASE).read().decode()
TOKEN=re.search(r'name="demo-token" content="([^"]+)"',page)[1]
def request(path,data=None,extra=None):
    headers={'X-Demo-Token':TOKEN,'Content-Type':'application/json'};headers.update(extra or {})
    req=urllib.request.Request(BASE+path,data=json.dumps(data).encode() if data is not None else None,headers=headers)
    with urllib.request.urlopen(req,timeout=12) as r:return json.load(r)
def run(files,criteria=None):
    for _ in range(180):
        try:
            job=request('/api/analyze',{'files':files,'criteria':criteria or {}})
            break
        except urllib.error.HTTPError as e:
            if e.code!=409: raise
            time.sleep(2)
    else: raise TimeoutError('Existing job did not finish')
    prior=None
    for _ in range(400):
        state=request('/api/jobs/'+job['job_id'])
        if state['stage']!=prior:
            print(state['stage'],flush=True);prior=state['stage']
        if state['status']!='running':return state
        time.sleep(1)
    raise TimeoutError('Job timed out')
def expect_http(code,path,data=None,extra=None):
    try:request(path,data,extra);raise AssertionError('Expected rejection')
    except urllib.error.HTTPError as e:assert e.code==code,(e.code,code)

evidence={'http_security':{},'runs':[]}
expect_http(403,'/api/samples',extra={'X-Demo-Token':'wrong'})
expect_http(403,'/api/samples',extra={'Origin':'http://evil.invalid'})
expect_http(400,'/api/analyze',{'files':[]})
expect_http(400,'/api/analyze',{'files':[{'name':'x.pdf','data':'x'}],'criteria':{'quantity_mt':-20}})
evidence['http_security']={'invalid_token':True,'cross_origin':True,'empty_files':True,'invalid_criteria':True}
files=request('/api/samples')['files']
baseline=run(files);assert baseline['status']=='done',baseline
r=baseline['result']['records'];assert [x['comparable_total'] for x in r]==[20880,21100,None]
assert baseline['result']['recommended_files']==['Demo_Supplier_B_Quotation.pdf']
evidence['runs'].append(baseline)
from pypdf import PdfReader
text=PdfReader(io.BytesIO(base64.b64decode(files[1]['data']))).pages[0].extract_text()
text='Supplier\nNorthwind Resin Demo\n'+text.replace('USD 1,055 / MT','USD 950 / MT').replace('USD 21,100','USD 19,000').replace('14 days after receipt of deposit','12 days after receipt of deposit')
buf=io.BytesIO();pdf=canvas.Canvas(buf);y=810
for line in text.splitlines():
    if y<45:pdf.showPage();y=810
    pdf.setFont('Helvetica',8);pdf.drawString(38,y,line);y-=11
pdf.save()
fresh=run([{'name':'New_Resin_Quote.pdf','data':base64.b64encode(buf.getvalue()).decode()}])
assert fresh['status']=='done',fresh
r=fresh['result']['records'][0];assert r['supplier']=='Northwind Resin Demo' and r['comparable_total']==19000 and r['shipment_days']==12 and r['eligible'],r['warnings']
assert fresh['result']['run_id']!=baseline['result']['run_id']
evidence['runs'].append(fresh)
bad=run([{'name':'broken.pdf','data':base64.b64encode(b'%PDF-invalid').decode()}]);assert bad['status']=='error'
evidence['malformed_pdf_error']=bad['stage']
for run_data in evidence['runs']:
    for receipt in run_data['result']['receipts']:
        assert receipt['privacy']=='local-only' and receipt['http_status']==200
evidence['passed']=True
out=Path(__file__).resolve().parents[1]/'output/meterless-demo/live-test-receipt.json'
out.write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS: auth/origin/input rejection, 3 uploaded PDFs, newly generated PDF with changed supplier/price/days, malformed PDF. 4 real Meterless calls, local-only.')
