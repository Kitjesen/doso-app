import copy
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('video_deploy', HERE / 'deploy.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class DeploymentTests(unittest.TestCase):
    def test_requires_all_twelve_active_layers_and_admin_mounts(self):
        layers = tuple(f'layer-{index}.yml' for index in range(12))
        records = {name: {'Config': {'Labels': {
            'com.docker.compose.project.working_dir': str(deploy.WORK),
            'com.docker.compose.project.config_files': ','.join(str(deploy.WORK / item) for item in layers),
        }}, 'Mounts': [{'Source': str(deploy.BASE_RELEASE) + '/functions'}]}
            for name in ('api-gw', 'functions')}
        deploy.verify_active_layers(records, layers)
        changed = copy.deepcopy(records)
        changed['functions']['Config']['Labels']['com.docker.compose.project.config_files'] += ',other.yml'
        with self.assertRaisesRegex(RuntimeError, 'expected_active_twelve_layers'):
            deploy.verify_active_layers(changed, layers)

    def test_effective_change_is_only_the_two_candidate_bind_mounts(self):
        before = {'services': {name: {'image': 'fixed', 'volumes': []}
            for name in ('db', 'auth', 'functions', 'api-gw')}}
        for name in ('functions', 'api-gw'):
            before['services'][name]['volumes'] = [{'type': 'bind', 'source': str(deploy.BASE_RELEASE) + '/' + name}]
        after = copy.deepcopy(before)
        for name in ('functions', 'api-gw'):
            after['services'][name]['volumes'][0]['source'] = str(deploy.HERE) + '/' + name
        deploy.verify_change(before, after)
        after['services']['db']['image'] = 'changed'
        with self.assertRaisesRegex(RuntimeError, 'unexpected_effective_compose_change'):
            deploy.verify_change(before, after)

    def test_nginx_preserves_existing_config_and_adds_only_video_allowlist(self):
        prefix = b'existing HTTP/ACME\n'
        original = b'log_format doso_api_status ' + deploy.OLD_FUNCTIONS
        candidate = original.replace(deploy.OLD_FUNCTIONS, deploy.NEW_FUNCTIONS)
        self.assertEqual(deploy.nginx_candidate(prefix + original, candidate), prefix + candidate)
        with self.assertRaisesRegex(RuntimeError, 'unexpected_https_configuration_change'):
            deploy.nginx_candidate(prefix + original, candidate + b'other setting')

    def test_database_postflight_is_read_only_and_checks_marker(self):
        docker = SimpleNamespace(run=Mock(return_value=deploy.POSTFLIGHT_MARKER))
        with patch.object(deploy, 'HERE', HERE):
            deploy.postflight(docker)
            self.assertTrue(docker.run.call_args.kwargs['data'].startswith(b'begin read only;'))
            docker.run.return_value = b'not confirmed'
            with self.assertRaisesRegex(RuntimeError, 'database_postflight_not_confirmed'):
                deploy.postflight(docker)


if __name__ == '__main__':
    unittest.main()
