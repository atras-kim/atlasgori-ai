"""Conservative source validation for labelled English/Korean quotation PDFs."""
import re
from datetime import datetime, date
from decimal import Decimal, InvalidOperation

LABELS = {
    'supplier': ['Supplier', 'Supplier name', '공급업체', '업체명'],
    'quantity': ['Quoted quantity', 'Quantity', '수량'],
    'moq': ['Minimum order', 'MOQ', '최소주문수량'],
    'unit_price': ['Unit price', '단가'],
    'amount': ['Goods amount', 'Quotation total', 'Total amount', '총액'],
    'terms': ['Trade terms', 'Incoterms', '거래조건'],
    'freight': ['Ocean freight', 'Freight', '해상운임'],
    'insurance': ['Cargo insurance', 'Insurance', '적하보험'],
    'shipment': ['Shipment', 'Lead time', '선적'],
    'payment': ['Payment', 'Payment terms', '결제'],
    'mfr': ['MFR', '용융흐름지수'],
    'documents': ['Documents', '서류'],
    'validity': ['Quotation validity', 'Validity', '견적 유효기간'],
    'product': ['Product', '품목'],
    'destination': ['Destination', 'Port of discharge', '목적항', '도착항'],
}
ALL_LABELS = {s.casefold() for labels in LABELS.values() for s in labels}

def norm(s):
    return re.sub(r'\s+', ' ', str(s or '')).strip()

def source_fields(pages):
    found = {}
    in_assumptions=False
    for page in pages:
        lines = [norm(x) for x in page['text'].splitlines() if norm(x)]
        for field, labels in LABELS.items():
            in_assumptions=False
            for i, line in enumerate(lines):
                if line.casefold()=='separate demo logistics assumptions':
                    in_assumptions=True
                    continue
                if line.casefold().startswith('comparison scope'): in_assumptions=False
                if in_assumptions: continue
                for label in labels:
                    if line.casefold().rstrip(':：') == label.casefold():
                        value = lines[i+1] if i+1 < len(lines) else ''
                        if value.casefold().rstrip(':：') in ALL_LABELS:
                            value = ''
                    else:
                        m = re.match(re.escape(label)+r'\s*[:：]\s*(.+)$', line, re.I)
                        if not m:
                            continue
                        value = m[1]
                    if value:
                        found.setdefault(field, []).append({'text': value, 'page': page['page'], 'label': label})
    return found

def numeric(text):
    if re.search(r'-\s*\d',text or ''):
        return None
    m = re.search(r'(?<![\w.])\d[\d,]*(?:\.\d+)?', text or '')
    if not m:
        return None
    try:
        value = Decimal(m[0].replace(',', ''))
        return float(value) if value.is_finite() else None
    except InvalidOperation:
        return None

def validate_document(doc, model, criteria):
    fields = source_fields(doc['pages'])
    evidence, warnings, corrections, unknown = {}, [], [], []
    def get(key):
        entries = fields.get(key, [])
        unique = {x['text'] for x in entries}
        if len(unique) != 1:
            unknown.append(key)
            if len(unique)>1:
                warnings.append(f'{key}: 페이지 간 원문 값 충돌')
            evidence[key] = {'value': None, 'page': None, 'status': '확인 필요', 'model_value': model.get(key)}
            return None
        item = entries[0]
        evidence[key] = {'value': item['text'], 'page': item['page'], 'status': '원문 라벨 확인', 'model_value': model.get(key)}
        if model.get(key) is not None and norm(model[key]) != norm(item['text']):
            corrections.append({'field': key, 'model': model[key], 'source': item['text'], 'page': item['page']})
        return item['text']
    raw = {key: get(key) for key in LABELS}
    # A bare title is display-only; it is never used to choose a winner.
    title = raw['supplier'] or doc['name']
    q, moq, price, amount = [numeric(raw[k]) for k in ['quantity','moq','unit_price','amount']]
    ambiguous=False
    for key in ['quantity','moq','unit_price','amount']:
        value=raw[key] or ''
        numbers=re.findall(r'\d[\d,]*(?:\.\d+)?',value)
        allowed_extra=False
        if key=='quantity' and len(numbers)==2 and re.search(r'\([\d,]+\s*kg\)',value,re.I):
            allowed_extra=numeric(numbers[1])==q*1000 if q is not None else False
        if key=='amount' and len(numbers)==2 and re.search(r'calculated for\s+[\d,.]+\s*MT',value,re.I):
            allowed_extra=numeric(numbers[1])==q
        if re.search(r'\bor\b|\bto\b|subject|optional|~|至|또는|선택|범위',value,re.I) or (len(numbers)>1 and not allowed_extra):
            ambiguous=True;warnings.append(f'{key}: 복수·조건부 숫자 확인 필요')
    unit_ok = all(raw[k] and re.search(r'\bMT\b|metric ton|톤',raw[k],re.I) for k in ['quantity','moq','unit_price'])
    currency_ok = all(raw[k] and re.search(r'\bUSD\b',raw[k],re.I) for k in ['unit_price','amount'])
    if not unit_ok: warnings.append('수량·MOQ·단가의 MT 단위 확인 필요 (kg 자동 환산 안 함)')
    if not currency_ok: warnings.append('USD 통화 확인 필요 (환율 변환 안 함)')
    valid_numbers = not ambiguous and all(x is not None and x>0 for x in [q,moq,price,amount])
    if not valid_numbers: warnings.append('수량·MOQ·단가·총액의 양수 숫자 확인 필요')
    if q is not None and q != criteria['quantity_mt']: warnings.append('구매 요구수량과 견적수량 불일치')
    if q is not None and moq is not None and moq>q: warnings.append('MOQ가 견적수량보다 큼')
    arithmetic_ok = valid_numbers and abs(q*price-amount)<0.02
    if valid_numbers and not arithmetic_ok: warnings.append('수량 × 단가와 견적 총액 불일치')
    terms = raw['terms'] or ''
    cif = bool(re.search(r'\bCIF\b',terms,re.I))
    fob = bool(re.search(r'\bFOB\b',terms,re.I))
    if cif and fob:
        cif=fob=False;warnings.append('CIF·FOB 복수 거래조건: 확인 필요')
    def included(text):
        return bool(text and re.search(r'\bincluded\b|포함',text,re.I) and not re.search(r'\bnot\b|excluded|subject|additional|premium|optional|pending|미포함|별도|조건|separately',text,re.I))
    insurance_ok = included(raw['insurance'])
    freight_ok = included(raw['freight'])
    if cif and not insurance_ok: warnings.append('CIF 표기와 보험 포함 조건 미확인 또는 충돌')
    comparable, certainty, assumptions = None, '미확정', {}
    if cif and freight_ok and insurance_ok and arithmetic_ok and unit_ok and currency_ok:
        comparable, certainty = amount, '견적 기준 CIF 금액'
    elif fob and arithmetic_ok and unit_ok and currency_ok:
        # Assumptions are accepted only from the explicitly labelled demo section.
        text='\n'.join(p['text'] for p in doc['pages'])
        section=re.search(r'Separate demo logistics assumptions\s*(.*?)(?:Comparison scope|$)',text,re.S|re.I)
        if section:
            for key, label in [('freight','Ocean freight'),('insurance','Cargo insurance')]:
                m=re.search(re.escape(label)+r':\s*USD\s*([\d,]+(?:\.\d+)?)\s+per shipment',section[1],re.I)
                if m: assumptions[key]=numeric(m[1])
        if len(assumptions)==2:
            comparable=round(amount+sum(assumptions.values()),2);certainty='물류 가정 포함 추정액'
        else: warnings.append('FOB 운임·보험 미확정: 비교액 산정 보류')
    else:
        warnings.append('비교 범위의 운임·보험 또는 가격 산식 확인 필요')
    shipment = raw['shipment'] or ''
    days = numeric(shipment) if re.search(r'days?|일',shipment,re.I) else None
    trigger_ok = bool(re.search(r'after receipt of deposit|선금.*수령.*후|계약금.*수령.*후',shipment,re.I))
    if re.search(r'arrival|delivery|not stated|subject|estimated|approx|business|working|\bor\b|도착|미기재|영업일|예상',shipment,re.I) or len(re.findall(r'\d+(?:\.\d+)?',shipment))!=1: trigger_ok=False
    if days is None or not trigger_ok: warnings.append('선적 기산점 또는 일수 확인 필요')
    elif days>criteria['shipment_days_max']: warnings.append(f'선적 {days:g}일: {criteria["shipment_days_max"]:g}일 기준 초과')
    payment=raw['payment'] or ''
    deposit=re.search(r'(\d+(?:\.\d+)?)%\s*deposit',payment,re.I)
    balance_ok=bool(re.search(r'(against|after).*copy.*(bill of lading|B/L)|B/L.*사본',payment,re.I))
    if not deposit or float(deposit[1])>criteria['deposit_percent_max'] or not balance_ok or re.search(r'100%.*before|subject|not provided|optional|\bor\b',payment,re.I):
        warnings.append('선금 한도·잔금 B/L 사본 조건 미충족 또는 확인 필요')
    mfr=raw['mfr'] or ''
    mf=numeric(mfr)
    if mf is None or abs(mf-criteria['mfr'])>criteria['mfr_tolerance'] or not re.search(r'230\s*(?:C|°C)',mfr,re.I) or '2.16' not in mfr:
        warnings.append('MFR 수치·시험 온도·하중 확인 필요')
    documents=raw['documents'] or ''
    if not all(x in documents.upper() for x in ['TDS','COA','SDS']) or re.search(r'\bnot\b|unavailable|optional|pending|subject|excluded|on request|considered|미기재|미제공|불가|요청',documents,re.I):
        warnings.append('TDS·선적 로트 COA·SDS 제공 확약 확인 필요')
    if not re.search(r'shipment.lot|선적.*로트',documents,re.I): warnings.append('COA의 선적 로트 일치 확인 필요')
    validity=raw['validity'] or ''
    parsed_date=None
    for pattern,fmt in [(r'\d{1,2} [A-Za-z]+ \d{4}','%d %B %Y'),(r'\d{4}-\d{2}-\d{2}','%Y-%m-%d')]:
        match=re.search(pattern,validity)
        if match:
            try: parsed_date=datetime.strptime(match[0],fmt).date()
            except ValueError: pass
    if parsed_date is None: warnings.append('견적 유효기간 확인 필요')
    elif parsed_date<date.today(): warnings.append('견적 유효기간 만료')
    product=raw['product'] or ''
    if not all(re.search(pattern,product,re.I) for pattern in ['PP|폴리프로필렌','virgin|신재','homopolymer|호모','injection|사출']): warnings.append('신재 PP 호모폴리머·사출 용도 확인 필요')
    if re.search(r'recycled|scrap|off.spec|not virgin|non.virgin|재생|불량',product,re.I): warnings.append('품목의 신재·규격 조건 충돌')
    if not raw['destination'] or not re.search(r'Busan|부산',raw['destination'],re.I): warnings.append('부산 목적항 확인 필요')
    if cif and not re.search(r'Busan|부산',terms,re.I): warnings.append('CIF 지정항이 부산인지 확인 필요')
    required=[k for k in LABELS if k!='supplier']
    for k in required:
        if k in unknown: warnings.append(f'{k}: 원문 라벨 미기재 또는 복수 값, 확인 필요')
    if q is not None and moq is not None and moq>q: comparable=None;certainty='MOQ 정정 전 미확정'
    warnings=list(dict.fromkeys(warnings))
    return {'supplier':title,'file':doc['name'],'sha256':doc['sha256'],'fields':evidence,'quantity_mt':q,'moq_mt':moq,'unit_price':price,'quoted_amount':amount,'comparable_total':comparable,'cost_type':certainty,'assumptions':assumptions,'shipment_days':days,'eligible':not warnings,'warnings':warnings,'corrections':corrections,'model':model,'pages':doc['pages']}

def compare(records):
    eligible=[r for r in records if r['eligible'] and r['comparable_total'] is not None]
    if not eligible: return []
    minimum=min(r['comparable_total'] for r in eligible)
    return [r['file'] for r in eligible if r['comparable_total']==minimum]
