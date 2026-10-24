import sys,unittest,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src/meterless_demo'))
from validation import validate_document,compare,numeric
from server import criteria_values,extract

ROOT=Path(__file__).resolve().parents[1]
DOCS=json.loads((ROOT/'output/meterless-demo/pdf-extracted.json').read_text(encoding='utf-8'))
CRIT={'quantity_mt':20,'shipment_days_max':21,'deposit_percent_max':30,'mfr':12,'mfr_tolerance':2}
def record(i,change=None,criteria=None,pages=None):
    d=DOCS[i];text=d['pages'][0]['text']
    if change:
        for a,b in change.items():text=text.replace(a,b)
    return validate_document({'name':'arbitrary-file-'+str(i)+'.pdf','sha256':'test','pages':pages or [{'page':1,'text':text}]},{},criteria or CRIT)

class Tests(unittest.TestCase):
    def test_original(self):
        a,b,c=[record(i) for i in range(3)]
        self.assertEqual(a['comparable_total'],20880);self.assertFalse(a['eligible'])
        self.assertEqual(b['comparable_total'],21100);self.assertTrue(b['eligible'])
        self.assertIsNone(c['comparable_total']);self.assertFalse(c['eligible'])
        self.assertEqual(compare([a,b,c]),[b['file']])
    def test_changed_pdf_changes_winner(self):
        a=record(0,{'28 days':'18 days','USD 980 / MT':'USD 900 / MT','USD 19,600':'USD 18,000'})
        b=record(1)
        self.assertTrue(a['eligible']);self.assertEqual(a['comparable_total'],19280)
        self.assertEqual(compare([a,b]),[a['file']])
    def test_changed_criteria(self):
        b=record(1,criteria={**CRIT,'shipment_days_max':10});self.assertFalse(b['eligible']);self.assertEqual(compare([b]),[])
    def test_missing_never_zero(self):
        a=record(0,{'Ocean freight: USD 1,200 per shipment.':'Ocean freight not confirmed.'})
        self.assertIsNone(a['comparable_total'])
        b=record(1,{'Minimum order\n20 MT\n':''});self.assertFalse(b['eligible']);self.assertIsNone(b['moq_mt'])
    def test_no_double_count_and_mismatch(self):
        b=record(1);self.assertEqual(b['comparable_total'],21100);self.assertEqual(b['assumptions'],{})
        b=record(1,{'USD 21,100':'USD 20,000'});self.assertIsNone(b['comparable_total'])
    def test_currency_units(self):
        for change in [{'USD':'EUR'},{'20 MT':'20 kg'}]:
            r=record(1,change);self.assertFalse(r['eligible']);self.assertIsNone(r['comparable_total'])
    def test_second_page_conflict(self):
        r=record(1,pages=DOCS[1]['pages']+[{'page':2,'text':'Shipment\n30 days after receipt of deposit'}]);self.assertFalse(r['eligible']);self.assertIsNone(r['shipment_days'])
    def test_second_page_evidence(self):
        r=record(1,pages=[{'page':2,'text':DOCS[1]['pages'][0]['text']}]);self.assertTrue(r['eligible']);self.assertEqual(r['fields']['amount']['page'],2)
    def test_model_hallucination_corrected(self):
        doc={'name':'B.pdf','sha256':'test','pages':DOCS[1]['pages']}
        r=validate_document(doc,{'amount':'USD 99,999'},CRIT)
        self.assertEqual(r['comparable_total'],21100);self.assertTrue(r['corrections'])
    def test_unknown_labels_conservative(self):
        r=record(1,{'Payment\n':'Unrecognized terms\n'});self.assertFalse(r['eligible'])
    def test_invalid_and_scanned_pdf(self):
        import base64,io
        from pypdf import PdfWriter
        with self.assertRaises(ValueError):extract('../evil.txt',base64.b64encode(b'%PDF-x').decode())
        w=PdfWriter();w.add_blank_page(width=100,height=100);b=io.BytesIO();w.write(b)
        with self.assertRaisesRegex(ValueError,'텍스트'):extract('scan.pdf',base64.b64encode(b.getvalue()).decode())
    def test_input_and_expiry(self):
        for value in [float('nan'),-1,True,float('inf')]:
            with self.assertRaises(ValueError):criteria_values({'quantity_mt':value})
        self.assertIsNone(numeric('USD -100'))
        self.assertFalse(record(1,{'27 October 2026':'27 October 2020'})['eligible'])
    def test_negation_conditional_arrival_and_destination(self):
        changes=[{'TDS, shipment-lot COA and SDS provided':'TDS, shipment-lot COA and SDS not provided'},
            {'Included; insured amount 110% of contract value; ICC(C)':'Included subject to additional premium'},
            {'14 days after receipt of deposit':'14 days after receipt of deposit for arrival, shipment date not stated'},
            {'Busan':'Tokyo'}, {'Virgin PP homopolymer, injection molding grade':'PP homopolymer, off-spec scrap waste'}]
        for change in changes:
            with self.subTest(change=change): self.assertFalse(record(1,change)['eligible'])
    def test_ambiguous_values_and_terms(self):
        for change in [{'20 MT':'20 MT or 40 MT'}, {'USD 1,055 / MT':'USD 1,055 / MT or USD 1,200 / MT'}, {'CIF Busan, Incoterms 2020':'CIF Busan or FOB Singapore'}, {'14 days after':'14 or 28 days after'}]:
            with self.subTest(change=change):self.assertFalse(record(1,change)['eligible'])

if __name__=='__main__':unittest.main()
