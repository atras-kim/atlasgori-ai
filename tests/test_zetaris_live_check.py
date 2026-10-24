import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from zetaris_live_check import verified_one, response_shape

class Tests(unittest.TestCase):
    def test_real_row(self):
        self.assertTrue(verified_one({'records':[{'one':'1'}],'totalCount':1}))
        self.assertTrue(verified_one({'data':[{'one':'1'}]}))
        self.assertTrue(verified_one({'result':{'rows':[{'one':1}]},'status':'completed'}))
    def test_job_not_result(self):
        self.assertFalse(verified_one({'queryId':'job','status':'running'}))
    def test_invalid_values_and_errors(self):
        for value in [True,0,'7',None]:
            self.assertFalse(verified_one({'data':[{'one':value}]}))
        for flag in [{'error':'failed'},{'success':False},{'status':'running'}]:
            self.assertFalse(verified_one({**flag,'data':[{'one':1}]}))
        self.assertFalse(verified_one({'data':[{'one':1},{'one':1}]}))
        self.assertFalse(verified_one({'metadata':{'one':1},'data':[]}))
        self.assertFalse(verified_one({'data':[{'one':1},{'other':2}]}))
        self.assertFalse(verified_one({'records':[{'one':True}]}))
        self.assertFalse(verified_one({'records':[{'one':'1'},{'one':'1'}]}))
    def test_shape_not_secrets(self):
        self.assertNotIn('private-token',str(response_shape({'token':'private-token'})))

if __name__=='__main__': unittest.main()
