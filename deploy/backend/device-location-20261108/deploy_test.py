import copy
import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('deploy',Path(__file__).parent/'deploy.py')
deploy=importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
class ReleaseTests(unittest.TestCase):
    def test_only_functions_mount_changes(self):
        before={'services':{'functions':{'environment':{'DOSO_ALLOWED_WEB_ORIGINS':'http://localhost:8081'},'volumes':[{'source':str(deploy.PREVIOUS/'functions'),'target':'/home/deno/functions'}]},'api-gw':{'image':'fixed'},'db':{'image':'fixed'}}}
        after=copy.deepcopy(before)
        after['services']['functions']['volumes'][0]['source']=str(deploy.HERE/'functions')
        deploy.verify_change(before,after)
        for service in ('functions','api-gw','db'):
            changed=copy.deepcopy(after)
            changed['services'][service]['image']='unexpected'
            with self.assertRaisesRegex(RuntimeError,'unexpected_effective_compose_change'):
                deploy.verify_change(before,changed)
    def test_origin_is_preserved(self):
        before={'services':{'functions':{'environment':{'DOSO_ALLOWED_WEB_ORIGINS':'http://localhost:8081'},'volumes':[{'source':str(deploy.PREVIOUS/'functions'),'target':'/home/deno/functions'}]}}}
        after=copy.deepcopy(before)
        after['services']['functions']['volumes'][0]['source']=str(deploy.HERE/'functions')
        after['services']['functions']['environment']['DOSO_ALLOWED_WEB_ORIGINS']='*'
        with self.assertRaisesRegex(RuntimeError,'unexpected_effective_compose_change'):
            deploy.verify_change(before,after)
if __name__=='__main__':
    unittest.main()
