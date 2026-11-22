import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('device_cloud_deploy', Path(__file__).with_name('deploy.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
db_spec = importlib.util.spec_from_file_location('device_cloud_database', Path(__file__).with_name('deploy-database.py'))
database = importlib.util.module_from_spec(db_spec)
db_spec.loader.exec_module(database)


class DeploymentTests(unittest.TestCase):
    def test_named_key_preserves_existing_environment_and_is_retryable(self):
        original = "ANON_KEY=synthetic-anon\nSUPABASE_SECRET_KEYS='{" + '"existing":"synthetic-old-key"' + "}'\nOTHER=unchanged\n"
        result = deploy.sync_environment(original)
        self.assertEqual(deploy.sync_environment(result), result)
        self.assertTrue(result.startswith('ANON_KEY=synthetic-anon\n'))
        self.assertTrue(result.endswith('OTHER=unchanged\n'))
        value = result.split('SUPABASE_SECRET_KEYS=', 1)[1].splitlines()[0].strip("'")
        keys = json.loads(value)
        self.assertEqual(keys['existing'], 'synthetic-old-key')
        self.assertGreaterEqual(len(keys['remote-state-sync']), 40)

    def test_malformed_or_duplicate_key_configuration_is_rejected(self):
        for value in ['SUPABASE_SECRET_KEYS=bad\n', 'SUPABASE_SECRET_KEYS={}\nSUPABASE_SECRET_KEYS={}\n', 'SUPABASE_SECRET_KEYS=[]\n', 'SUPABASE_SECRET_KEYS={"remote-state-sync":"short"}\n']:
            with self.subTest(value=value), self.assertRaises(RuntimeError):
                deploy.sync_environment(value)

    def test_only_expected_effective_service_changes_are_accepted(self):
        before = {'services': {name: {'volumes': [], 'environment': {}} for name in deploy.SERVICES}}
        before['services']['functions']['volumes'] = [{'type': 'bind', 'source': '/runtime/doso/account-sessions-20261027/functions'}]
        before['services']['functions']['environment'] = {'SUPABASE_ANON_KEY': 'anon', 'SUPABASE_SERVICE_ROLE_KEY': 'service'}
        after = copy.deepcopy(before)
        after['services']['functions']['volumes'][0]['source'] = '/runtime/doso/device-cloud-20261103/functions'
        after['services']['functions']['environment'].update({'SUPABASE_SECRET_KEYS': json.dumps({'remote-state-sync': 'sb_secret_' + 'synthetic' * 5}), 'DOSO_REMOTE_SYNC_SECRET_NAME': 'remote-state-sync'})
        deploy.verify_change(before, after)
        after['services']['db']['image'] = 'unexpected'
        with self.assertRaises(RuntimeError):
            deploy.verify_change(before, after)

    def test_running_functions_can_lack_healthcheck_but_others_must_be_healthy(self):
        records = [{'Config': {'Labels': {'com.docker.compose.service': name}}, 'State': {'Running': True, 'Health': {'Status': 'healthy'}}} for name in sorted(deploy.SERVICES)]
        functions = next(record for record in records if record['Config']['Labels']['com.docker.compose.service'] == 'functions')
        del functions['State']['Health']
        docker = SimpleNamespace(run=Mock(side_effect=[b'1\n2\n3\n4\n5\n6\n', json.dumps(records).encode()]))
        self.assertEqual(set(deploy.snapshot(docker)), deploy.SERVICES)
        functions['State']['Health'] = {'Status': 'unhealthy'}
        docker.run = Mock(side_effect=[b'1\n2\n3\n4\n5\n6\n', json.dumps(records).encode()])
        with self.assertRaises(RuntimeError):
            deploy.snapshot(docker)
        del functions['State']['Health']
        db = next(record for record in records if record['Config']['Labels']['com.docker.compose.service'] == 'db')
        del db['State']['Health']
        docker.run = Mock(side_effect=[b'1\n2\n3\n4\n5\n6\n', json.dumps(records).encode()])
        with self.assertRaises(RuntimeError):
            deploy.snapshot(docker)

    def test_core_identity_ignores_mount_order_but_detects_recreation_and_restart(self):
        before = {name: {'Id': name + '-id', 'Created': 'creation-time', 'Config': {}, 'HostConfig': {}, 'State': {'StartedAt': 'unchanged-time'}, 'Mounts': [{'Destination': '/a'}, {'Destination': '/b'}]} for name in deploy.CORE}
        after = copy.deepcopy(before)
        after['db']['Mounts'].reverse()
        self.assertEqual(deploy.core_identity(before), deploy.core_identity(after))
        after['db']['Id'] = 'recreated-id'
        self.assertNotEqual(deploy.core_identity(before), deploy.core_identity(after))
        after['db']['Id'] = before['db']['Id']
        after['db']['State']['StartedAt'] = 'restarted-time'
        self.assertNotEqual(deploy.core_identity(before), deploy.core_identity(after))
        after['db']['State']['StartedAt'] = before['db']['State']['StartedAt']
        after['db']['Config']['UnexpectedChange'] = True
        self.assertNotEqual(deploy.core_identity(before), deploy.core_identity(after))


class DatabaseReleaseTests(unittest.TestCase):
    def test_backup_validation_precedes_copy_and_transaction(self):
        docker = SimpleNamespace(command=['docker'], environment={}, run=Mock(side_effect=[b'/tmp/doso-device-cloud-sql-ABC12345\n', b'', b'PASS device_cloud_transaction_committed\n', b'']))
        calls = []

        def run(command, **options):
            calls.append(command)
            if 'pg_dump' in command:
                options['stdout'].write(b'PGDMP-synthetic-archive')
            else:
                self.assertEqual(options['stdin'].read(), b'PGDMP-synthetic-archive')
            return subprocess.CompletedProcess(command, 0)

        with tempfile.TemporaryDirectory() as directory, patch.object(database.subprocess, 'run', side_effect=run):
            database.release(docker, Path('/release/sql'), Path(directory))
        self.assertIn('pg_dump', calls[0])
        self.assertEqual(calls[1][-2:], ['pg_restore', '--list'])
        self.assertEqual(docker.run.call_args_list[1].args[0][0], 'cp')
        self.assertEqual(docker.run.call_args_list[2].args[0][-4:], ['-v', 'ON_ERROR_STOP=1', '-f', '/tmp/doso-device-cloud-sql-ABC12345/apply.sql'])

    def test_invalid_archive_stops_before_copy_or_apply(self):
        docker = SimpleNamespace(command=['docker'], environment={}, run=Mock())

        def run(command, **options):
            if 'pg_dump' in command:
                options['stdout'].write(b'PGDMP-synthetic-archive')
                return subprocess.CompletedProcess(command, 0)
            return subprocess.CompletedProcess(command, 1)

        with tempfile.TemporaryDirectory() as directory, patch.object(database.subprocess, 'run', side_effect=run):
            with self.assertRaisesRegex(RuntimeError, 'database_backup_validation_failed'):
                database.release(docker, Path('/release/sql'), Path(directory))
        docker.run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
