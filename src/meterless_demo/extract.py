import io,json,sys
from pypdf import PdfReader
try:
    reader=PdfReader(io.BytesIO(sys.stdin.buffer.read(3*1024*1024+1)))
    if reader.is_encrypted: raise ValueError('암호화 PDF는 지원하지 않습니다.')
    if not 1<=len(reader.pages)<=10: raise ValueError('PDF는 1~10페이지여야 합니다.')
    pages=[{'page':i+1,'text':p.extract_text() or ''} for i,p in enumerate(reader.pages)]
    if not ''.join(p['text'] for p in pages).strip(): raise ValueError('텍스트 없는 PDF입니다. 스캔 OCR은 아직 지원하지 않습니다.')
    if sum(len(p['text']) for p in pages)>6500: raise ValueError('모델 문맥 한도를 위해 PDF당 텍스트 6,500자 이하로 줄여 주세요.')
    sys.stdout.buffer.write(json.dumps(pages,ensure_ascii=False).encode('utf-8'))
except Exception as exc:
    sys.stdout.buffer.write(str(exc).encode('utf-8'));sys.exit(1)
