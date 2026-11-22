import copy
import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('deploy',Path(__file__).parent/'deploy.py')
deploy=importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
class ReleaseTests(unittest.TestCase):
    def test_only_functions_mount_and_explicit_origin_change(self):
        before={'services':{'functions':{'environment':{'DOSO_ALLOWED_WEB_ORIGINS':''},'volumes':[{'source':str(deploy.PREVIOUS/'functions'),'target':'/home/deno/functions'}]},'api-gw':{'image':'fixed'},'db':{'image':'fixed'}}}
        after=copy.deepcopy(before)
        after['services']['functions']['volumes'][0]['source']=str(deploy.HERE/'functions')
        after['services']['functions']['environment']['DOSO_ALLOWED_WEB_ORIGINS']='http://localhost:8081'
        deploy.verify_change(before,after)
        after['services']['api-gw']['image']='changed'
        with self.assertRaisesRegex(RuntimeError,'unexpected_effective_compose_change'):
            deploy.verify_change(before,after)
    def test_existing_origins_cannot_be_dropped(self):
        before={'services':{'functions':{'environment':{'DOSO_ALLOWED_WEB_ORIGINS':'https://existing.example'},'volumes':[{'source':str(deploy.PREVIOUS/'functions'),'target':'/home/deno/functions'}]}}}
        with self.assertRaisesRegex(RuntimeError,'existing_web_origins_require_preservation'):
            deploy.verify_change(before,copy.deepcopy(before))
if __name__=='__main__':
    unittest.main()
