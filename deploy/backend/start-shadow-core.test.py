import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import smtplib
import ssl
import stat
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, mock_open, patch
import zipfile

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('start_shadow_core', HERE / 'start-shadow-core.py')
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)
PASSWORD = 'synthetic-only $ quote\'" \\ password'


def model():
    services = {}
    for name, image in module.IMAGES.items():
        services[name] = {'image': image, 'networks': {'default': {}}, 'volumes': [], 'environment': {}}
    services['meta'] = {'image': module.META}
    services['api-gw'] = {'ports': [{'host_ip': '127.0.0.1', 'published': '18000', 'target': 8000, 'protocol': 'tcp'}]}
    services['db']['container_name'] = 'supabase-db'
    services['auth']['container_name'] = 'supabase-auth'
    services['rest']['container_name'] = 'supabase-rest'
    services['auth']['depends_on'] = {'db': {}, 'mail-templates': {}}
    services['rest']['depends_on'] = {'db': {}}
    services['db']['volumes'] = [{'type': 'bind', 'source': module.WORK + '/volumes/db/data', 'target': '/var/lib/postgresql/data'}, {'type': 'volume', 'source': 'db-config', 'target': '/etc/postgresql-custom'}]
    services['db']['environment'] = {'POSTGRES_DB': 'postgres', 'POSTGRES_PORT': '5432', 'POSTGRES_PASSWORD': 'syntheticdbpassword'}
    services['rest']['healthcheck'] = {'test': ['CMD', 'postgrest', '--ready']}
    services['rest']['environment'] = {'PGRST_DB_URI': 'postgres://authenticator:syntheticdbpassword@db:5432/postgres'}
    services['auth']['environment'] = {'GOTRUE_DB_DATABASE_URL': 'postgres://supabase_auth_admin:syntheticdbpassword@db:5432/postgres', 'GOTRUE_MAILER_TEMPLATES_CONFIRMATION': 'http://mail-templates:8080/confirmation.html', 'GOTRUE_SMTP_HOST': 'smtpdm.aliyun.com', 'GOTRUE_SMTP_PORT': '465', 'GOTRUE_SMTP_USER': 'no-reply@auth.dosorobotics.com', 'GOTRUE_SMTP_ADMIN_EMAIL': 'no-reply@auth.dosorobotics.com', 'GOTRUE_SMTP_SENDER_NAME': 'DOSO', 'GOTRUE_SMTP_PASS': PASSWORD.replace('$', '$$')}
    return {'name': module.PROJECT, 'services': services, 'networks': {'default': {'name': module.NETWORK}}, 'volumes': {'db-config': {'name': module.PROJECT + '_db-config'}}}


def interpolation(password=PASSWORD):
    return ('PATH=/synthetic\nSMTP_PASS=' + password + '\n').encode('utf-8')


class CoreGuardTests(unittest.TestCase):
    def test_public_runtime_archive_has_the_pinned_manifest_and_all_37_reviewed_files(self):
        archive = HERE.parents[1] / 'artifacts/release-readiness/20261027-shadow-runtime-01/DOSO-backend-shanghai-runtime-v2.zip'
        with zipfile.ZipFile(archive) as source:
            files = {module.ROOT + '/' + name: source.read(name) for name in source.namelist()}
        with patch.object(module, 'read_public', side_effect=lambda path, limit: files[path]) as read:
            module.validate_runtime()
        self.assertEqual(read.call_count, 38)
        self.assertTrue(all(call.args[0].startswith(module.ROOT + '/') and not call.args[0].endswith('/.env') for call in read.call_args_list))
        files[module.ROOT + '/docker/doso/confirmation.html'] += b'changed'
        with patch.object(module, 'read_public', side_effect=lambda path, limit: files[path]):
            with self.assertRaisesRegex(module.GuardError, '^runtime_file_mismatch$'):
                module.validate_runtime()

    def test_real_local_compose_accepts_the_full_public_bundle_with_only_synthetic_credentials(self):
        docker = shutil.which('docker')
        if not docker:
            self.skipTest('local Compose CLI unavailable; Docker engine is not needed')
        loaded = {}
        for name in ('prepare-shadow-env', 'configure-shadow-smtp'):
            spec = importlib.util.spec_from_file_location(name.replace('-', '_'), HERE / (name + '.py'))
            loaded[name] = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(loaded[name])
        node = 'C:/Program Files/nodejs/node.exe' if os.name == 'nt' else 'node'
        keys = subprocess.run([node, str(HERE / 'generate-shadow-keys.mjs'), '--private-pipe'], capture_output=True, timeout=10, check=False)
        self.assertTrue(keys.returncode == 0 and not keys.stderr, 'synthetic_key_generation_failed')
        archive = HERE.parents[1] / 'artifacts/release-readiness/20261027-shadow-runtime-01/DOSO-backend-shanghai-runtime-v2.zip'
        with tempfile.TemporaryDirectory(prefix='doso-core-synthetic-') as temporary:
            root = Path(temporary)
            with zipfile.ZipFile(archive) as source:
                for name in source.namelist():
                    destination = root / name
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(source.read(name))
            work = root / 'docker'
            prepared = loaded['prepare-shadow-env'].render_environment((work / '.env.example').read_text(encoding='utf-8'), json.loads(keys.stdout), 'https://api-test.dosorobotics.com')
            environment_file = root / 'synthetic.env'
            environment_file.write_bytes(loaded['configure-shadow-smtp'].render_environment(prepared, PASSWORD))
            private = root / 'client'
            private.mkdir()
            plugins = Path(docker).parent.parent / 'cli-plugins'
            if os.name == 'nt' and plugins.is_dir():
                (private / 'config.json').write_text(json.dumps({'cliPluginsExtraDirs': [str(plugins)]}), encoding='utf-8')
            environment = {key: os.environ[key] for key in ('PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP') if key in os.environ}
            environment.update(HOME=temporary, USERPROFILE=temporary, DOCKER_CONFIG=str(private))
            command = [docker, '--config', str(private), 'compose', '--project-name', module.PROJECT, '--project-directory', str(work), '--env-file', str(environment_file)]
            for layer in module.LAYERS:
                command.extend(('-f', str(work / layer)))
            result = subprocess.run(command + ['config', '--format', 'json'], capture_output=True, timeout=30, env=environment, check=False)
            self.assertTrue(result.returncode == 0, 'synthetic_six_layer_compose_failed_without_printing_output')
            composed = json.loads(result.stdout)
            # Map only temporary host bind paths to the fixed Linux deployment path.
            for service in composed['services'].values():
                for volume in service.get('volumes', []):
                    if volume['type'] == 'bind':
                        actual = volume['source'].replace('\\', '/')
                        self.assertTrue(actual.casefold().startswith(work.as_posix().casefold() + '/'), 'unexpected_synthetic_bind')
                        volume['source'] = module.WORK + actual[len(work.as_posix()):]
            module.validate_model(composed)
            result = subprocess.run(command + ['config', '--environment'], capture_output=True, timeout=30, env=environment, check=False)
            self.assertTrue(result.returncode == 0, 'synthetic_interpolation_failed_without_printing_output')
            smtp = MagicMock()
            smtp.__enter__.return_value = smtp
            with patch.object(module.smtplib, 'SMTP_SSL', return_value=smtp):
                module.smtp_authenticate(composed['services']['auth']['environment'], result.stdout)
            self.assertTrue(smtp.login.call_args.args[1] == PASSWORD, 'synthetic_smtp_password_exact_roundtrip')

    def test_model_allows_only_the_fixed_loopback_port_and_four_service_dependencies(self):
        module.validate_model(model())
        changes = [lambda value: value.update(name='old-project'), lambda value: value['services']['auth'].update(image='unapproved:latest'), lambda value: value['services']['api-gw']['ports'][0].update(host_ip='0.0.0.0'), lambda value: value['services']['api-gw']['ports'][0].update(published='443'), lambda value: value['services']['auth'].update(ports=[{'published': '9999'}]), lambda value: value['services']['auth']['depends_on'].update(studio={}), lambda value: value['services']['auth'].update(network_mode='host'), lambda value: value['services']['db'].update(privileged=True), lambda value: value['services']['rest'].update(build='.'), lambda value: value['services']['rest']['healthcheck'].update(test=['CMD-SHELL', 'wrong']), lambda value: value['services']['db']['volumes'][0].update(source='/old/data'), lambda value: value['volumes']['db-config'].update(external=True), lambda value: value['networks']['default'].update(name='old_default'), lambda value: value['services']['auth']['environment'].update(GOTRUE_DB_DATABASE_URL='postgres://supabase_auth_admin:syntheticdbpassword@old-db:5432/postgres')]
        for change in changes:
            altered = model()
            change(altered)
            with self.assertRaises(module.GuardError):
                module.validate_model(altered)

    def test_smtp_authenticates_with_strict_tls_and_exact_unescaped_password_without_sending(self):
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        with patch.object(module.smtplib, 'SMTP_SSL', return_value=smtp) as connect:
            module.smtp_authenticate(model()['services']['auth']['environment'], interpolation())
        args, options = connect.call_args
        self.assertEqual(args, ('smtpdm.aliyun.com', 465))
        self.assertEqual(options['timeout'], 15)
        context = options['context']
        self.assertTrue(context.check_hostname)
        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
        self.assertEqual(context.minimum_version, ssl.TLSVersion.TLSv1_2)
        smtp.login.assert_called_once_with('no-reply@auth.dosorobotics.com', PASSWORD)
        smtp.sendmail.assert_not_called()
        smtp.send_message.assert_not_called()
        smtp.set_debuglevel.assert_not_called()

    def test_smtp_configuration_or_serialization_errors_stop_before_connecting(self):
        for name, value in [('GOTRUE_SMTP_HOST', 'other.test'), ('GOTRUE_SMTP_PORT', '587'), ('GOTRUE_SMTP_USER', 'other@example.test'), ('GOTRUE_SMTP_ADMIN_EMAIL', 'other@example.test'), ('GOTRUE_SMTP_SENDER_NAME', 'Other'), ('GOTRUE_SMTP_PASS', 'unescaped$dollar'), ('GOTRUE_SMTP_PASS', ''), ('GOTRUE_SMTP_PASS', 'x' * 4097)]:
            auth = model()['services']['auth']['environment']
            auth[name] = value
            with patch.object(module.smtplib, 'SMTP_SSL') as connect:
                with self.assertRaises(module.GuardError):
                    module.smtp_authenticate(auth, interpolation())
                connect.assert_not_called()
        with patch.object(module.smtplib, 'SMTP_SSL') as connect:
            with self.assertRaisesRegex(module.GuardError, '^smtp_serialization_mismatch$'):
                module.smtp_authenticate(model()['services']['auth']['environment'], interpolation('different'))
            connect.assert_not_called()

    def test_smtp_failures_have_fixed_classifications_and_no_remote_diagnostics(self):
        for error, reason in [(ssl.SSLCertVerificationError('synthetic private detail'), 'smtp_tls_verification_failed'), (smtplib.SMTPAuthenticationError(535, b'synthetic private detail'), 'smtp_authentication_failed'), (TimeoutError('synthetic private detail'), 'smtp_timeout'), (OSError('synthetic private detail'), 'smtp_connection_failed')]:
            with patch.object(module.smtplib, 'SMTP_SSL', side_effect=error):
                with self.assertRaisesRegex(module.GuardError, '^' + reason + '$'):
                    module.smtp_authenticate(model()['services']['auth']['environment'], interpolation())

    def test_capacity_thresholds_are_inclusive_and_fail_before_starting(self):
        disk = SimpleNamespace(f_bavail=5 * 1024 ** 3, f_frsize=1)
        with patch('builtins.open', mock_open(read_data='MemAvailable: 1572864 kB\n')), patch.object(module.os, 'statvfs', return_value=disk, create=True):
            module.check_capacity()
        with patch('builtins.open', mock_open(read_data='MemAvailable: 1572863 kB\n')):
            with self.assertRaisesRegex(module.GuardError, '^insufficient_available_memory$'):
                module.check_capacity()
        with patch('builtins.open', mock_open(read_data='MemAvailable: 1572864 kB\n')), patch.object(module.os, 'statvfs', return_value=SimpleNamespace(f_bavail=5 * 1024 ** 3 - 1, f_frsize=1), create=True):
            with self.assertRaisesRegex(module.GuardError, '^insufficient_free_disk$'):
                module.check_capacity()

    def test_website_snapshot_is_anonymous_fixed_host_bounded_no_redirect_and_only_returns_hashes(self):
        body = b'synthetic existing public website'
        nginx = b'synthetic nginx configuration and private diagnostics'
        connection = MagicMock()
        response = connection.getresponse.return_value
        response.status = 200
        response.read.return_value = body
        with patch.object(module.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=nginx)) as nginx_run, patch.object(module.http.client, 'HTTPConnection', return_value=connection) as connect, patch.object(module.signal, 'SIGALRM', 14, create=True), patch.object(module.signal, 'signal'), patch.object(module.signal, 'alarm', create=True) as alarm:
            snapshot = module.website_snapshot()
        self.assertEqual(set(snapshot), {'nginx', 'http'})
        self.assertTrue(all(len(value) == 64 for value in snapshot.values()))
        self.assertNotIn('synthetic', json.dumps(snapshot))
        self.assertEqual(nginx_run.call_args.args[0], ['/usr/sbin/nginx', '-T'])
        self.assertEqual(nginx_run.call_args.kwargs['stderr'], subprocess.PIPE)
        self.assertEqual(nginx_run.call_args.kwargs['timeout'], 15)
        connect.assert_called_once_with('127.0.0.1', 80, timeout=5)
        connection.request.assert_called_once_with('GET', '/', headers={'Host': 'inovxio.com', 'Accept-Encoding': 'identity', 'Connection': 'close'})
        response.read.assert_called_once_with(2 * 1024 * 1024 + 1)
        self.assertEqual([call.args[0] for call in alarm.call_args_list], [15, 0])
        connection.close.assert_called_once()

    def test_nginx_warning_time_and_pid_changes_do_not_change_the_configuration_hash(self):
        connection = MagicMock()
        connection.getresponse.return_value.status = 200
        connection.getresponse.return_value.read.return_value = b'synthetic public website'
        results = [SimpleNamespace(returncode=0, stdout=b'same synthetic config dump', stderr=warning) for warning in (b'2026/10/27 10:00:00 [warn] 1234#1234: synthetic warning', b'2026/10/27 10:01:00 [warn] 5678#5678: synthetic warning')]
        output = io.StringIO()
        with patch.object(module.subprocess, 'run', side_effect=results), patch.object(module.http.client, 'HTTPConnection', return_value=connection), patch.object(module.signal, 'SIGALRM', 14, create=True), patch.object(module.signal, 'signal'), patch.object(module.signal, 'alarm', create=True), contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            before = module.website_snapshot()
            after = module.website_snapshot()
        self.assertEqual(before, after)
        self.assertEqual(output.getvalue(), '')

    def test_website_redirect_and_oversize_are_rejected_and_connections_close(self):
        for status, body, reason in [(302, b'synthetic', 'website_http_200_required'), (200, b'x' * (2 * 1024 * 1024 + 1), 'website_response_too_large')]:
            connection = MagicMock()
            connection.getresponse.return_value.status = status
            connection.getresponse.return_value.read.return_value = body
            with patch.object(module.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=b'synthetic nginx')), patch.object(module.http.client, 'HTTPConnection', return_value=connection), patch.object(module.signal, 'SIGALRM', 14, create=True), patch.object(module.signal, 'signal'), patch.object(module.signal, 'alarm', create=True):
                with self.assertRaisesRegex(module.GuardError, '^' + reason + '$'):
                    module.website_snapshot()
            connection.request.assert_called_once()
            connection.close.assert_called_once()

    def test_website_total_deadline_is_fixed_and_restores_signal_handler(self):
        connection = MagicMock()
        with patch.object(module.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=b'synthetic nginx')), patch.object(module.http.client, 'HTTPConnection', return_value=connection), patch.object(module.signal, 'SIGALRM', 14, create=True), patch.object(module.signal, 'signal', return_value='synthetic-old-handler') as handler, patch.object(module.signal, 'alarm', create=True):
            def trigger(*args, **kwargs):
                handler.call_args.args[1](14, None)
            connection.request.side_effect = trigger
            with self.assertRaisesRegex(module.GuardError, '^website_probe_timed_out$'):
                module.website_snapshot()
            self.assertEqual(handler.call_args.args, (14, 'synthetic-old-handler'))
        connection.close.assert_called_once()

    def test_directory_traversal_is_anchored_to_root_with_nofollow_and_safe_owners(self):
        good = SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=0)
        with patch.object(module.os, 'O_DIRECTORY', 0x10000, create=True), patch.object(module.os, 'O_NOFOLLOW', 0x20000, create=True), patch.object(module.os, 'open', side_effect=[10, 11, 12]) as opened, patch.object(module.os, 'fstat', return_value=good), patch.object(module.os, 'close'):
            self.assertEqual(module.open_directory('/opt/public'), 12)
            self.assertEqual([call.args[0] for call in opened.call_args_list], ['/', 'opt', 'public'])
            self.assertEqual([call.kwargs.get('dir_fd') for call in opened.call_args_list], [None, 10, 11])
            self.assertTrue(all(call.args[1] & module.os.O_NOFOLLOW for call in opened.call_args_list))
        for info in (SimpleNamespace(st_mode=stat.S_IFLNK | 0o777, st_uid=0), SimpleNamespace(st_mode=stat.S_IFDIR | 0o777, st_uid=0), SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=1000)):
            with patch.object(module.os, 'O_DIRECTORY', 0x10000, create=True), patch.object(module.os, 'O_NOFOLLOW', 0x20000, create=True), patch.object(module.os, 'open', return_value=10), patch.object(module.os, 'fstat', return_value=info), patch.object(module.os, 'close'):
                with self.assertRaises(module.GuardError):
                    module.open_directory('/opt/public')

    def test_private_environment_is_fixed_regular_root0600_and_exclusively_locked(self):
        flock = SimpleNamespace(LOCK_EX=2, LOCK_NB=4, flock=MagicMock())
        good = SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_uid=0, st_nlink=1, st_size=100)
        for info, allowed in [(good, True), (SimpleNamespace(**(vars(good) | {'st_nlink': 2})), False), (SimpleNamespace(**(vars(good) | {'st_uid': 1000})), False), (SimpleNamespace(**(vars(good) | {'st_mode': stat.S_IFREG | 0o644})), False), (SimpleNamespace(**(vars(good) | {'st_mode': stat.S_IFIFO | 0o600})), False)]:
            with patch.dict(sys.modules, {'fcntl': flock}), patch.object(module, 'open_directory', return_value=10) as directory, patch.object(module.os, 'O_NONBLOCK', 0x800, create=True), patch.object(module.os, 'O_NOFOLLOW', 0x20000, create=True), patch.object(module.os, 'open', return_value=20) as opened, patch.object(module.os, 'fstat', return_value=info), patch.object(module.os, 'close'):
                if allowed:
                    self.assertEqual(module.lock_environment(), (10, 20))
                else:
                    with self.assertRaises(module.GuardError):
                        module.lock_environment()
                directory.assert_called_once_with('/opt/doso-backend-shadow/env', 0o700)
                self.assertEqual(opened.call_args.args[0], '.env')
                self.assertTrue(opened.call_args.args[1] & module.os.O_NOFOLLOW and opened.call_args.args[1] & module.os.O_NONBLOCK)
        self.assertTrue(all(call.args[1] == 6 for call in flock.flock.call_args_list))

    def test_data_is_created_only_at_the_fixed_path_and_nonempty_or_nonroot_data_is_rejected(self):
        good = SimpleNamespace(st_mode=stat.S_IFDIR | 0o700, st_uid=0)
        for info, contents, allowed in [(good, [], True), (good, ['PG_VERSION'], False), (SimpleNamespace(st_mode=stat.S_IFDIR | 0o700, st_uid=999), [], False)]:
            with patch.object(module, 'open_directory', return_value=10) as parent, patch.object(module.os, 'mkdir') as created, patch.object(module.os, 'O_DIRECTORY', 0x10000, create=True), patch.object(module.os, 'O_NOFOLLOW', 0x20000, create=True), patch.object(module.os, 'open', return_value=20), patch.object(module.os, 'fstat', return_value=info), patch.object(module.os, 'listdir', return_value=contents), patch.object(module.os, 'close'):
                if allowed:
                    module.prepare_data()
                else:
                    with self.assertRaises(module.GuardError):
                        module.prepare_data()
                parent.assert_called_once_with(module.WORK + '/volumes/db')
                created.assert_called_once_with('data', 0o700, dir_fd=10)

    def test_docker_command_has_six_explicit_layers_local_socket_and_no_inherited_credentials(self):
        with patch.dict(os.environ, {'DOCKER_HOST': 'tcp://wrong', 'SMTP_PASS': PASSWORD}):
            docker = module.Docker('/run/synthetic-private')
        self.assertEqual(docker.command, ['/usr/bin/docker', '--config', '/run/synthetic-private', '--host', 'unix:///var/run/docker.sock'])
        self.assertEqual(docker.compose.count('-f'), 6)
        self.assertEqual([docker.compose[index + 1] for index, value in enumerate(docker.compose) if value == '-f'], [module.WORK + '/' + layer for layer in module.LAYERS])
        self.assertNotIn('SMTP_PASS', docker.environment)
        self.assertNotIn('DOCKER_HOST', docker.environment)
        self.assertEqual(docker.environment['DOCKER_CONFIG'], '/run/synthetic-private')
        result = SimpleNamespace(returncode=0, stdout=b'synthetic captured output', stderr=b'synthetic private diagnostic')
        with patch.object(module.subprocess, 'run', return_value=result) as executed:
            self.assertEqual(docker.run(['version']), result.stdout)
        self.assertTrue(executed.call_args.kwargs['capture_output'])
        self.assertEqual(executed.call_args.kwargs['stdin'], subprocess.DEVNULL)
        self.assertNotIn('shell', executed.call_args.kwargs)

    def test_existing_containers_networks_volumes_and_missing_images_stop_without_cleanup(self):
        for scenario in ('clean', 'project_container', 'fixed_container', 'unlabeled_project_container', 'project_network', 'unlabeled_volume', 'wrong_image'):
            calls = []
            def run(args, **kwargs):
                calls.append(args)
                if args[:3] == ['container', 'ls', '-aq']:
                    return b'a' if scenario == 'project_container' else b''
                if args[:3] == ['container', 'ls', '-a']:
                    return b'supabase-db\n' if scenario == 'fixed_container' else (module.PROJECT + '-orphan\n').encode() if scenario == 'unlabeled_project_container' else b'unrelated-old-service\n'
                if args[:3] == ['network', 'ls', '-q']:
                    return b'a' if scenario == 'project_network' else b''
                if args[:3] == ['volume', 'ls', '-q']:
                    return b''
                if args[:2] in (['network', 'ls'], ['volume', 'ls']):
                    return (module.PROJECT + '_db-config\n').encode() if scenario == 'unlabeled_volume' and args[0] == 'volume' else b'other-resource\n'
                return json.dumps({'architecture': 'arm64' if scenario == 'wrong_image' else 'amd64', 'os': 'linux'}).encode()
            docker = module.Docker('/run/synthetic-private')
            with patch.object(docker, 'run', side_effect=run):
                if scenario == 'clean':
                    docker.preflight()
                else:
                    with self.assertRaises(module.GuardError):
                        docker.preflight()
            self.assertFalse(any('rm' in args or 'down' in args or 'up' in args for args in calls))

    def test_started_container_ids_are_verified_without_reading_container_environment(self):
        ids = {name: hex(index + 1)[2:] * 64 for index, name in enumerate(sorted(module.SELECTED))}
        records = {cid: {'id': cid, 'name': '/' + module.NAMES[name], 'labels': {'com.docker.compose.project': module.PROJECT, 'com.docker.compose.service': name}, 'image': module.IMAGES[name], 'running': True, 'health': 'healthy'} for name, cid in ids.items()}
        docker = module.Docker('/run/synthetic-private')
        def run(args, **kwargs):
            return ('\n'.join(ids.values()) + '\n').encode() if args[:2] == ['container', 'ls'] else json.dumps(records[args[2]]).encode()
        with patch.object(docker, 'run', side_effect=run) as executed:
            self.assertEqual(docker.verify_started(), ids)
        self.assertNotIn('.Config.Env', module.INSPECT)
        records[ids['rest']]['labels']['com.docker.compose.project'] = 'old-project'
        with patch.object(docker, 'run', side_effect=run):
            with self.assertRaises(module.GuardError):
                docker.verify_started()

    def test_probe_uses_the_verified_rest_healthcheck_and_one_restricted_network_client(self):
        docker = module.Docker('/run/synthetic-private')
        calls = []
        def run(args, **kwargs):
            calls.append((args, kwargs))
            return b'{"auth":true,"confirmation":true}' if args[0] == 'run' else b''
        with patch.object(docker, 'run', side_effect=run):
            docker.probe('a' * 64)
        self.assertEqual(calls[0][0], ['exec', 'a' * 64, 'postgrest', '--ready'])
        command, options = calls[1]
        for flag, value in (('--pull', 'never'), ('--network', module.NETWORK), ('--log-driver', 'none'), ('--user', '65532:65532'), ('--memory', '128m'), ('--pids-limit', '32')):
            self.assertEqual(command[command.index(flag) + 1], value)
        for flag in ('--rm', '--read-only', '--no-healthcheck'):
            self.assertIn(flag, command)
        self.assertIn(module.META, command)
        self.assertEqual(options['data'], module.PROBE)
        self.assertNotIn(PASSWORD.encode(), module.PROBE)
        self.assertIn(module.MAIL_HASH.encode(), module.PROBE)
        self.assertNotIn(b'authorization', module.PROBE.lower())

    def test_probe_timeout_cleans_only_the_captured_verified_nonce_cid(self):
        for scenario in ('valid', 'missing_cid', 'wrong_nonce', 'rm_failed'):
            docker = module.Docker('/run/synthetic-private')
            calls = []
            cid = 'c' * 64
            def run(args, **kwargs):
                calls.append(args)
                if args[0] == 'exec':
                    return b''
                if args[0] == 'run':
                    raise subprocess.TimeoutExpired('synthetic private command', 20)
                if args[:2] == ['container', 'inspect']:
                    return json.dumps({'id': cid, 'name': '/doso-shadow-core-probe-' + 'a' * 16, 'labels': {'io.doso.shadow-core-probe': 'wrong' if scenario == 'wrong_nonce' else 'a' * 16, 'com.docker.compose.project': module.PROJECT, 'com.docker.compose.service': 'core-probe'}}).encode()
                if scenario == 'rm_failed':
                    raise module.GuardError('docker_command_failed')
                return b''
            read = MagicMock(side_effect=FileNotFoundError) if scenario == 'missing_cid' else MagicMock(return_value=cid.encode())
            with patch.object(module.secrets, 'token_hex', return_value='a' * 16), patch.object(module, 'read_public', read), patch.object(docker, 'run', side_effect=run):
                reason = 'probe_interrupted_or_timed_out' if scenario == 'valid' else 'probe_cleanup_unconfirmed'
                with self.assertRaisesRegex(module.GuardError, '^' + reason + '$'):
                    docker.probe('b' * 64)
            removals = [args for args in calls if args[:2] == ['container', 'rm']]
            self.assertEqual(removals, [['container', 'rm', '-f', cid]] if scenario in ('valid', 'rm_failed') else [])

    def mocked_main(self, failure=None):
        docker = MagicMock()
        docker.compose = module.Docker('/run/synthetic-private').compose
        commands = []
        def run(args, **kwargs):
            commands.append(args)
            if args[-3:] == ['--format', 'json'] or args[-3:] == ['config', '--format', 'json']:
                return json.dumps(model()).encode()
            if args[-2:] == ['config', '--environment']:
                return interpolation()
            if failure == 'db' and args[-1] == 'db':
                raise module.GuardError('docker_command_failed')
            return b''
        docker.run.side_effect = run
        docker.verify_started.return_value = {'rest': 'a' * 64}
        resource = SimpleNamespace(RLIMIT_CORE=4, setrlimit=MagicMock())
        output = io.StringIO()
        snapshots = [{'nginx': 'a' * 64, 'http': 'b' * 64}, {'nginx': ('c' if failure == 'website' else 'a') * 64, 'http': 'b' * 64}]
        with patch.object(module.sys, 'platform', 'linux'), patch.object(module.os, 'geteuid', return_value=0, create=True), patch.object(module.os, 'umask'), patch.dict(sys.modules, {'resource': resource}), patch.object(module, 'lock_environment', return_value=(10, 20)), patch.object(module, 'validate_runtime'), patch.object(module, 'check_capacity'), patch.object(module, 'prepare_data'), patch.object(module, 'website_snapshot', side_effect=snapshots), patch.object(module.tempfile, 'TemporaryDirectory', return_value=contextlib.nullcontext('/run/synthetic-private')), patch.object(module.os, 'chmod'), patch.object(module.os, 'listdir', return_value=[]), patch.object(module.os, 'close') as closed, patch.object(module, 'Docker', return_value=docker), patch.object(module, 'smtp_authenticate', side_effect=module.GuardError('smtp_authentication_failed') if failure == 'smtp' else None) as smtp, contextlib.redirect_stdout(output):
            code = module.main([])
        return code, commands, output.getvalue(), docker, smtp, closed

    def test_mocked_main_starts_db_first_then_auth_rest_with_only_the_mail_dependency(self):
        code, commands, output, docker, smtp, closed = self.mocked_main()
        self.assertEqual(code, 0)
        starts = [args[args.index('up'):] for args in commands if 'up' in args]
        self.assertEqual(starts, [['up', '--wait', '--wait-timeout', '120', '--pull', 'never', 'db'], ['up', '--wait', '--wait-timeout', '120', '--pull', 'never', 'auth', 'rest']])
        smtp.assert_called_once()
        docker.probe.assert_called_once_with('a' * 64)
        self.assertNotIn(PASSWORD, output)
        self.assertTrue(json.loads(output.splitlines()[-1])['confirmation_hash_verified'])
        self.assertTrue(json.loads(output.splitlines()[-1])['website_preserved'])
        self.assertEqual([call.args[0] for call in closed.call_args_list], [20, 10])

    def test_mocked_main_never_starts_after_smtp_failure_and_never_downs_or_retries_failed_db(self):
        for failure in ('smtp', 'db'):
            code, commands, output, docker, _, _ = self.mocked_main(failure)
            self.assertEqual(code, 1)
            starts = [args for args in commands if 'up' in args]
            self.assertEqual(len(starts), 0 if failure == 'smtp' else 1)
            self.assertFalse(any('down' in args or 'rm' in args for args in commands))
            final = json.loads(output.splitlines()[-1])
            self.assertEqual(final['services_may_be_running'], failure == 'db')
            docker.probe.assert_not_called()
            self.assertNotIn(PASSWORD, output)

    def test_mocked_main_detects_concurrent_website_change_without_rollback_or_deletion(self):
        code, commands, output, _, _, _ = self.mocked_main('website')
        self.assertEqual(code, 1)
        self.assertFalse(any('down' in args or 'rm' in args for args in commands))
        result = json.loads(output.splitlines()[-1])
        self.assertEqual(result['reason'], 'existing_website_changed')
        self.assertEqual(result['stage'], 'website_after')
        self.assertTrue(result['services_may_be_running'])
        self.assertFalse(result['website_preserved'])

    def test_mocked_main_rejects_arguments_without_echoing_them_or_reading_environment(self):
        output = io.StringIO()
        with patch.object(module, 'lock_environment') as locked, contextlib.redirect_stdout(output):
            self.assertEqual(module.main([PASSWORD]), 1)
        locked.assert_not_called()
        self.assertNotIn(PASSWORD, output.getvalue())
        self.assertEqual(json.loads(output.getvalue())['reason'], 'arguments_not_allowed')


if __name__ == '__main__':
    unittest.main()
