import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src/meterless_demo'))
from zetaris import Client, ZetarisError, NoRedirect, POLICY_SQL

VALUES = {'ZETARIS_REST_URL': 'https://example.test/api/v1.0',
          'ZETARIS_ORG_ID': '1', 'ZETARIS_API_KEY': 'synthetic-test-key'}


class Tests(unittest.TestCase):
    def test_missing(self):
        with self.assertRaises(ZetarisError): Client({})

    def test_url_boundary(self):
        for url in ['http://remote.test/api/v1.0', 'https://user:secret@host/api/v1.0',
                    'https://host/api/v1.0?key=secret', 'https://host/dashboard', 'file:///api/v1.0']:
            with self.assertRaises(ZetarisError): Client({**VALUES, 'ZETARIS_REST_URL': url})
        Client({**VALUES, 'ZETARIS_REST_URL': 'http://localhost:8888/api/v1.0'})

    def test_health_requires_exact_response(self):
        for rows in [[], [[0]], [['1']], [[True]], [[1], [1]], {'one': 1}]:
            with patch.object(Client, '_run', return_value=(rows, 'test')):
                with self.assertRaises(ZetarisError): Client(VALUES).check()
        with patch.object(Client, '_run', return_value=([[1]], 'test')) as run:
            self.assertTrue(Client(VALUES).check()['connected'])
            run.assert_called_once_with('SELECT 1 AS one', 1)

    def test_policy_query_and_values(self):
        with patch.object(Client, '_run', return_value=([[25, 18, 20, 10, 1]], 'test')) as run:
            result = Client(VALUES).policy()
            self.assertEqual(result['criteria']['quantity_mt'], 25)
            self.assertEqual(result['source'], 'zetaris-rest')
            run.assert_called_once_with(POLICY_SQL, 2)

    def test_bad_policies_do_not_fall_back(self):
        for rows in [[], [[20]*5]*2, [[20]*4], [[True,21,30,12,2]],
                     [[20,21,101,12,2]], [[20,21,30,'NaN',2]], [[0,21,30,12,2]]]:
            with patch.object(Client, '_run', return_value=(rows, 'test')):
                with self.assertRaises(ZetarisError): Client(VALUES).policy()

    def test_protocol_and_no_secret_response(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, size): return b'{"data":[[1]]}'
        with patch('zetaris.build_opener') as opener:
            opener.return_value.open.return_value = Response()
            result = Client(VALUES).check()
            req = opener.return_value.open.call_args.args[0]
            self.assertEqual(req.full_url, 'https://example.test/api/v1.0/sql-editor/sqls/run')
            self.assertEqual(json.loads(req.data)['sql'], 'SELECT 1 AS one')
            self.assertEqual(req.get_header('Authorization'), 'Bearer synthetic-test-key')
            self.assertNotIn('synthetic-test-key', json.dumps(result))

    def test_upstream_errors_redacted(self):
        with patch('zetaris.build_opener') as opener:
            opener.return_value.open.side_effect = HTTPError('secret-url',401,'secret-key',{},None)
            with self.assertRaises(ZetarisError) as error: Client(VALUES).check()
            self.assertNotIn('secret', str(error.exception))
        self.assertIsNone(NoRedirect().redirect_request(None,None,None,None,None,None))


if __name__ == '__main__': unittest.main()
