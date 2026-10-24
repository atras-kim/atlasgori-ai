import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src/meterless_demo'))
from zetaris_local import LocalClient
from zetaris import ZetarisError, FIELDS
from server import resolve_criteria


class Tests(unittest.TestCase):
    def test_rows_and_boundaries(self):
        for response in [{'records':[{'one':'1'}]}, {'records':[{'one':1}]}]:
            with patch('zetaris_local.session', return_value={}), patch('zetaris_local.request', return_value=response):
                self.assertTrue(LocalClient().check()['connected'])
        for response in [{'records':[{'one':True}]}, {'records':[{'one':'1'}],'status':'running'},
                         {'records':[{'one':'1'},{'one':'1'}]}, {'one':1}, {'records':[{'one':'1','extra':1}]}]:
            with patch('zetaris_local.session', return_value={}), patch('zetaris_local.request', return_value=response):
                with self.assertRaises(ZetarisError): LocalClient().check()
        with self.assertRaises(ZetarisError): LocalClient()._run('DROP TABLE anything', 1)

    def test_policy_fetch_overrides_browser_values(self):
        policy={'criteria':dict(zip(FIELDS,(20,21,30,12,2))), 'policy_id':'PP_BUSAN_DEMO',
                'source':'zetaris-local-ui-proxy','request_id':'live-request'}
        with patch('server.ZetarisClient') as factory:
            factory.return_value.policy.return_value=policy
            criteria, receipt=resolve_criteria({'criteria_source':'zetaris','criteria':{'quantity_mt':999}})
            self.assertEqual(criteria['quantity_mt'],20)
            self.assertEqual(receipt['request_id'],'live-request')
            self.assertEqual(len(receipt['criteria_sha256']),64)

    def test_failure_has_no_manual_fallback(self):
        with patch('server.ZetarisClient') as factory:
            factory.return_value.policy.side_effect=ZetarisError('offline')
            with self.assertRaises(ZetarisError): resolve_criteria({'criteria_source':'zetaris'})
        self.assertEqual(resolve_criteria({})[1],{'source':'manual'})
        with self.assertRaises(ValueError): resolve_criteria({'criteria_source':'unknown'})


if __name__=='__main__': unittest.main()
