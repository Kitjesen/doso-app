import copy
import importlib.util
import json
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('history_deploy', HERE / 'deploy.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class ReleaseTests(unittest.TestCase):
    def test_private_environment_preserves_existing_keys_and_merges_export(self):
        existing = {'remote-state-sync': 'sb_secret_' + 's' * 40, 'other': 'existing'}
        content = "DOSO_THINGSBOARD_URL='http://127.0.0.1:28080'\nDOSO_THINGSBOARD_KEY='test-key'\n"
        encoded, values = deploy.merged_environment(json.dumps(existing), content)
        keys = json.loads(values['SUPABASE_SECRET_KEYS'])
        self.assertEqual({key: keys[key] for key in existing}, existing)
        self.assertGreaterEqual(len(keys['telemetry-export']), 40)
        second, _ = deploy.merged_environment(json.dumps(existing), encoded.decode())
        self.assertEqual(second, encoded)
        with self.assertRaisesRegex(RuntimeError, 'existing_named_key_changed'):
            deploy.merged_environment(json.dumps(existing), content + 'SUPABASE_SECRET_KEYS=\'{"other":"changed"}\'\n')

    def test_private_environment_rejects_unsafe_urls_and_duplicate_fields(self):
        for url in ('http://remote.test', 'https://user:pass@remote.test', 'https://remote.test/path', 'https://remote.test?q=1'):
            with self.assertRaises(RuntimeError):
                deploy.private_values('DOSO_THINGSBOARD_URL=' + url + '\nDOSO_THINGSBOARD_KEY=test\n')
        with self.assertRaisesRegex(RuntimeError, 'invalid_private_environment'):
            deploy.private_values('DOSO_THINGSBOARD_URL=https://test\nDOSO_THINGSBOARD_KEY=a\nDOSO_THINGSBOARD_KEY=b\n')

    def test_effective_change_preserves_every_other_service_and_origin(self):
        before = {'services': {name: {'image': 'fixed', 'volumes': []} for name in ('db', 'auth', 'functions', 'api-gw')}}
        before['services']['functions']['environment'] = {'SUPABASE_ANON_KEY': 'anon', 'SUPABASE_SERVICE_ROLE_KEY': 'service',
            'SUPABASE_SECRET_KEYS': '{}', 'DOSO_ALLOWED_WEB_ORIGINS': 'http://localhost:8081'}
        for name, directory in (('functions', deploy.PREVIOUS), ('api-gw', deploy.GATEWAY)):
            before['services'][name]['volumes'] = [{'type': 'bind', 'source': str(directory) + '/snapshot'}]
        values = {'SUPABASE_SECRET_KEYS': json.dumps({'telemetry-export': 'sb_secret_' + 't' * 40}),
            'DOSO_THINGSBOARD_URL': 'http://127.0.0.1:28080', 'DOSO_THINGSBOARD_KEY': 'test'}
        after = copy.deepcopy(before)
        for name in ('functions', 'api-gw'):
            after['services'][name]['volumes'][0]['source'] = str(deploy.HERE) + '/snapshot'
        after['services']['functions']['environment'].update(values, DOSO_TELEMETRY_EXPORT_SECRET_NAME='telemetry-export')
        deploy.verify_change(before, after, values)
        after['services']['functions']['environment']['DOSO_ALLOWED_WEB_ORIGINS'] = '*'
        with self.assertRaisesRegex(RuntimeError, 'unexpected_effective_compose_change'):
            deploy.verify_change(before, after, values)

    def test_separate_active_layer_counts_and_nginx_allowlist(self):
        layers = tuple('layer-' + str(index) for index in range(15))
        records = {name: {'Config': {'Labels': {'com.docker.compose.project.working_dir': str(deploy.WORK),
            'com.docker.compose.project.config_files': ','.join(str(deploy.WORK / item) for item in expected)}}}
            for name, expected in (('functions', layers), ('api-gw', layers[:13]))}
        deploy.verify_active_layers(records, layers)
        records['api-gw']['Config']['Labels']['com.docker.compose.project.config_files'] += ',unexpected'
        with self.assertRaisesRegex(RuntimeError, 'expected_active_fifteen_functions_thirteen_gateway_layers'):
            deploy.verify_active_layers(records, layers)
        gateway = deploy.module('history_gateway_test', HERE / 'gateway_base.py')
        gateway.OLD_FUNCTIONS, gateway.NEW_FUNCTIONS = deploy.OLD_FUNCTIONS, deploy.NEW_FUNCTIONS
        original = b'HTTP/ACME\nlog_format doso_api_status ' + deploy.OLD_FUNCTIONS
        candidate = original.split(b'\n', 1)[1].replace(deploy.OLD_FUNCTIONS, deploy.NEW_FUNCTIONS)
        self.assertEqual(gateway.nginx_candidate(original, candidate), b'HTTP/ACME\n' + candidate)


if __name__ == '__main__':
    unittest.main()
