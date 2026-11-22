import copy
from contextlib import nullcontext
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('device_admin_deploy', HERE / 'deploy.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
database = deploy.load_module('device_admin_database_test',
                              HERE.parent / 'device-cloud-20261103/deploy-database.py')


class DeploymentTests(unittest.TestCase):
    def test_runtime_stops_before_service_changes_when_database_postflight_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            here = root / 'release'
            (here / 'sql').mkdir(parents=True)
            (here / 'sql/postflight.sql').write_bytes(b'select false;\n')
            env = root / '.env'
            env.write_bytes(b'PRIVATE_SETTING=preserve\n')
            layers = tuple(f'layer-{index}.yml' for index in range(10))
            active_layers = layers + ('doso/device-cloud-20261103/compose.device-cloud.yml',)
            records = {name: {
                'Config': {'Labels': {
                    'com.docker.compose.project.working_dir': str(deploy.WORK),
                    'com.docker.compose.project.config_files': ','.join(str(deploy.WORK / item) for item in active_layers),
                }},
                'Mounts': [{'Source': str(deploy.BASE_RELEASE) + '/functions'}],
            } for name in ('api-gw', 'functions')}
            docker = SimpleNamespace(run=Mock(side_effect=[b'{"services":{}}', b'not ready']))
            base = SimpleNamespace(LAYERS=layers, snapshot=Mock(return_value=records),
                                   verify_actual_services=Mock())
            core = SimpleNamespace(lock_environment=Mock(return_value=()),
                                   Docker=Mock(return_value=docker))
            resource = SimpleNamespace(RLIMIT_CORE=0, setrlimit=Mock())
            stdout = io.StringIO()
            with patch.object(deploy, 'HERE', here), patch.object(deploy, 'ENV', env), \
                    patch.object(deploy, '__file__', str(here / 'deploy.py')), \
                    patch.object(deploy.sys, 'platform', 'linux'), \
                    patch.object(deploy.sys, 'argv', ['deploy.py', 'runtime']), \
                    patch.object(deploy.os, 'geteuid', return_value=0, create=True), \
                    patch.object(deploy.os, 'umask'), \
                    patch.dict('sys.modules', {'resource': resource}), \
                    patch.object(deploy, 'load_module', side_effect=[base, SimpleNamespace(), core]), \
                    patch.object(deploy.tempfile, 'TemporaryDirectory', return_value=nullcontext(directory)), \
                    patch.object(deploy.sys, 'stdout', stdout):
                self.assertEqual(deploy.main(), 1)
            result = json.loads(stdout.getvalue())
            self.assertEqual(result['reason'], 'database_postflight_not_confirmed')
            self.assertTrue(all('up' not in item.args[0] for item in docker.run.call_args_list))
            self.assertEqual(env.read_bytes(), b'PRIVATE_SETTING=preserve\n')

    def test_both_runtime_services_must_use_the_complete_eleven_layer_baseline(self):
        layers = tuple(f'layer-{index}.yml' for index in range(11))
        records = {name: {
            'Config': {'Labels': {
                'com.docker.compose.project.working_dir': str(deploy.WORK),
                'com.docker.compose.project.config_files': ','.join(str(deploy.WORK / item) for item in layers),
            }},
            'Mounts': [{'Source': str(deploy.BASE_RELEASE) + '/functions'}],
        } for name in ('api-gw', 'functions')}
        deploy.verify_active_layers(records, layers)
        for name in records:
            changed = copy.deepcopy(records)
            changed[name]['Config']['Labels']['com.docker.compose.project.config_files'] += ',extra.yml'
            with self.subTest(service=name), self.assertRaisesRegex(RuntimeError, 'expected_active_eleven_layers'):
                deploy.verify_active_layers(changed, layers)
        records['api-gw']['Mounts'] = [{'Source': '/unrelated/functions'}]
        with self.assertRaisesRegex(RuntimeError, 'expected_device_cloud_mounts'):
            deploy.verify_active_layers(records, layers)

    def test_effective_change_only_accepts_the_two_release_bind_paths(self):
        before = {'services': {name: {'image': name + ':fixed', 'environment': {'value': 'unchanged'},
                    'volumes': []} for name in ('db', 'auth', 'rest', 'mail-templates', 'api-gw', 'functions')}}
        for name in ('api-gw', 'functions'):
            before['services'][name]['volumes'] = [
                {'type': 'bind', 'source': str(deploy.BASE_RELEASE) + '/' + name,
                 'target': '/' + name, 'read_only': True},
                {'type': 'volume', 'source': 'unchanged-cache', 'target': '/cache'},
            ]
        after = copy.deepcopy(before)
        for name in ('api-gw', 'functions'):
            after['services'][name]['volumes'][0]['source'] = str(deploy.HERE) + '/' + name
        deploy.verify_change(before, after)
        mutations = [
            ('db', 'image', 'new-image'),
            ('functions', 'environment', {'value': 'different'}),
            ('api-gw', 'ports', ['8000:8000']),
        ]
        for service, key, value in mutations:
            changed = copy.deepcopy(after)
            changed['services'][service][key] = value
            with self.subTest(service=service, key=key), self.assertRaisesRegex(RuntimeError, 'unexpected_effective_compose_change'):
                deploy.verify_change(before, changed)

    def test_nginx_candidate_preserves_http_and_accepts_only_the_allowlist_addition(self):
        prefix = b'server { listen 80; # existing ACME settings\n}\n'
        previous = b'log_format doso_api_status synthetic;\nserver { ' + deploy.OLD_FUNCTIONS + b' }\n'
        candidate = previous.replace(deploy.OLD_FUNCTIONS, deploy.NEW_FUNCTIONS)
        self.assertEqual(deploy.nginx_candidate(prefix + previous, candidate), prefix + candidate)
        for unexpected in (candidate.replace(b'synthetic', b'changed'), candidate + b'new setting;\n'):
            with self.assertRaisesRegex(RuntimeError, 'unexpected_https_configuration_change'):
                deploy.nginx_candidate(prefix + previous, unexpected)
        with self.assertRaisesRegex(RuntimeError, 'expected_existing_four_function_allowlist'):
            deploy.nginx_candidate(prefix + candidate, candidate)

    def test_nginx_validation_failure_restores_file_without_reloading(self):
        with tempfile.TemporaryDirectory() as directory:
            site = Path(directory) / 'doso-api'
            original = b'http ACME\nlog_format doso_api_status ' + deploy.OLD_FUNCTIONS
            candidate = b'log_format doso_api_status ' + deploy.NEW_FUNCTIONS
            site.write_bytes(original)
            command = Mock(side_effect=[RuntimeError('candidate_invalid'), None])
            with patch.object(deploy, 'SITE', site), patch.object(deploy, 'system_command', command):
                with self.assertRaisesRegex(RuntimeError, 'candidate_invalid'):
                    deploy.install_nginx(original, candidate)
            self.assertEqual(site.read_bytes(), original)
            self.assertEqual([item.args[0] for item in command.call_args_list],
                             [['/usr/sbin/nginx', '-t'], ['/usr/sbin/nginx', '-t']])

    def test_nginx_reload_failure_restores_and_reloads_original(self):
        with tempfile.TemporaryDirectory() as directory:
            site = Path(directory) / 'doso-api'
            original = b'http ACME\nlog_format doso_api_status ' + deploy.OLD_FUNCTIONS
            candidate = b'log_format doso_api_status ' + deploy.NEW_FUNCTIONS
            site.write_bytes(original)
            observed = []

            def command(arguments):
                observed.append((arguments, site.read_bytes()))
                if len(observed) == 2:
                    raise RuntimeError('reload_failed')

            with patch.object(deploy, 'SITE', site), patch.object(deploy, 'system_command', command):
                with self.assertRaisesRegex(RuntimeError, 'reload_failed'):
                    deploy.install_nginx(original, candidate)
            self.assertEqual(site.read_bytes(), original)
            self.assertEqual(len(observed), 4)
            self.assertEqual(observed[0][1], b'http ACME\n' + candidate)
            self.assertTrue(all(content == original for _, content in observed[2:]))

    def test_nginx_success_validates_before_reload(self):
        with tempfile.TemporaryDirectory() as directory:
            site = Path(directory) / 'doso-api'
            original = b'http ACME\nlog_format doso_api_status ' + deploy.OLD_FUNCTIONS
            candidate = b'log_format doso_api_status ' + deploy.NEW_FUNCTIONS
            site.write_bytes(original)
            with patch.object(deploy, 'SITE', site), patch.object(deploy, 'system_command') as command:
                deploy.install_nginx(original, candidate)
            self.assertEqual(site.read_bytes(), b'http ACME\n' + candidate)
            self.assertEqual([item.args[0] for item in command.call_args_list],
                             [['/usr/sbin/nginx', '-t'], ['/bin/systemctl', 'reload', 'nginx']])

    def test_postflight_is_read_only_and_requires_its_success_marker(self):
        with tempfile.TemporaryDirectory() as directory:
            here = Path(directory)
            (here / 'sql').mkdir()
            (here / 'sql/postflight.sql').write_bytes(b'select true;\n')
            docker = SimpleNamespace(run=Mock(return_value=deploy.POSTFLIGHT_MARKER))
            with patch.object(deploy, 'HERE', here):
                deploy.postflight(docker)
                self.assertEqual(docker.run.call_args.kwargs['data'],
                                 b'begin read only;\nselect true;\n\ncommit;\n')
                docker.run.return_value = b'no success marker'
                with self.assertRaisesRegex(RuntimeError, 'database_postflight_not_confirmed'):
                    deploy.postflight(docker)


class DatabaseReleaseTests(unittest.TestCase):
    def test_new_marker_reuses_the_validated_backup_and_cleanup_flow(self):
        calls = []
        docker = SimpleNamespace(command=['docker'], environment={}, run=Mock(side_effect=[
            b'/tmp/doso-device-cloud-sql-ABC12345\n', b'', deploy.COMMIT_MARKER, b'']))

        def run(command, **options):
            calls.append(command)
            if 'pg_dump' in command:
                options['stdout'].write(b'PGDMP-synthetic-archive')
            else:
                self.assertEqual(options['stdin'].read(), b'PGDMP-synthetic-archive')
            return subprocess.CompletedProcess(command, 0)

        with tempfile.TemporaryDirectory() as directory, patch.object(database.subprocess, 'run', side_effect=run):
            database.release(docker, Path('/release/sql'), Path(directory),
                             commit_marker=deploy.COMMIT_MARKER)
        self.assertIn('pg_dump', calls[0])
        self.assertEqual(calls[1][-2:], ['pg_restore', '--list'])
        self.assertEqual(docker.run.call_args_list[2].args[0][-1],
                         '/tmp/doso-device-cloud-sql-ABC12345/apply.sql')
        self.assertEqual(docker.run.call_args_list[-1].args[0][:3], ['exec', 'supabase-db', 'rm'])

    def test_old_success_marker_does_not_confirm_the_new_transaction(self):
        docker = SimpleNamespace(command=['docker'], environment={}, run=Mock(side_effect=[
            b'/tmp/doso-device-cloud-sql-ABC12345\n', b'', b'PASS device_cloud_transaction_committed', b'']))

        def run(command, **options):
            if 'pg_dump' in command:
                options['stdout'].write(b'PGDMP-synthetic-archive')
            return subprocess.CompletedProcess(command, 0)

        with tempfile.TemporaryDirectory() as directory, patch.object(database.subprocess, 'run', side_effect=run):
            with self.assertRaisesRegex(RuntimeError, 'database_commit_not_confirmed'):
                database.release(docker, Path('/release/sql'), Path(directory),
                                 commit_marker=deploy.COMMIT_MARKER)
        self.assertEqual(docker.run.call_args_list[-1].args[0][:3], ['exec', 'supabase-db', 'rm'])


if __name__ == '__main__':
    unittest.main()
