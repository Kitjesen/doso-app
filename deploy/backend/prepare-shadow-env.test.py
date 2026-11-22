import contextlib
import copy
import base64
import hashlib
import hmac
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location('shadow_env', HERE / 'prepare-shadow-env.py')
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class ShadowEnvironmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        node = 'C:/Program Files/nodejs/node.exe' if os.name == 'nt' else 'node'
        result = subprocess.run([node, str(HERE / 'generate-shadow-keys.mjs'), '--private-pipe'], capture_output=True, check=False, timeout=10)
        if result.returncode or result.stderr:
            raise RuntimeError('ephemeral_test_keys_failed')
        cls.records = json.loads(result.stdout)

    def test_records_and_pending_smtp_rendering(self):
        module.validate_records(self.records)
        template = '\n'.join(name + '=old-sample' for name in module.KEY_NAMES) + '\nSMTP_HOST=fake\nSMTP_PASS=fake\nSMTP_USER=fake\nOPENAI_API_KEY=fake\nCOMPOSE_FILE=docker-compose.yml\n'
        rendered = module.render_environment(template, self.records, module.PUBLIC_ORIGIN).decode()
        self.assertTrue('pending_smtp' in rendered and '\nSMTP_' not in rendered, 'pending_mail_gate')
        self.assertTrue("SITE_URL='doso://auth/callback'" in rendered, 'app_callback_preserved')
        self.assertTrue('/**' not in rendered and ','.join(module.CALLBACKS) in rendered, 'exact_callbacks_only')
        self.assertTrue('doso/compose.host-nginx.yml:doso/compose.images-amd64.yml' in rendered, 'mandatory_layers')
        self.assertTrue('old-sample' not in rendered and 'fake' not in rendered, 'samples_removed')

    def test_record_tampering_is_rejected_without_values(self):
        for change in ('legacy_signature', 'oct_key', 'unexpected_field'):
            records = copy.deepcopy(self.records)
            if change == 'legacy_signature':
                records['ANON_KEY'] += 'x'
            elif change == 'oct_key':
                jwks = json.loads(records['JWT_JWKS'])
                jwks['keys'][1]['k'] = 'wrong'
                records['JWT_JWKS'] = json.dumps(jwks)
            else:
                records['UNKNOWN_SECRET'] = 'synthetic'
            with self.assertRaises(module.PreparationError):
                module.validate_records(records)

    def test_additional_key_contract_counterexamples(self):
        for change in ('opaque_shape', 'opaque_checksum', 'nonjwt_es256', 'wrong_hs_role', 'short_db_password', 'short_base64_field', 'short_jwk_coordinate'):
            records = copy.deepcopy(self.records)
            if change == 'opaque_shape':
                records['SUPABASE_SECRET_KEY'] = 'wrong'
            elif change == 'opaque_checksum':
                value = records['SUPABASE_PUBLISHABLE_KEY']
                records['SUPABASE_PUBLISHABLE_KEY'] = value[:-1] + ('A' if value[-1] != 'A' else 'B')
            elif change == 'nonjwt_es256':
                records['ANON_KEY_ASYMMETRIC'] = 'not-a-jwt'
            elif change == 'wrong_hs_role':
                records['ANON_KEY'] = records['SERVICE_ROLE_KEY']
            elif change == 'short_db_password':
                records['POSTGRES_PASSWORD'] = 'a'
            elif change == 'short_base64_field':
                records['SECRET_KEY_BASE'] = 'YQ=='
            else:
                for name, array in (('JWT_KEYS', True), ('JWT_JWKS', False)):
                    value = json.loads(records[name])
                    (value if array else value['keys'])[0]['x'] = 'AQ'
                    records[name] = json.dumps(value)
            with self.assertRaises(module.PreparationError):
                module.validate_records(records)

    def test_jwt_header_issuer_and_time_claims_are_checked(self):
        def encode(value):
            return base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).rstrip(b'=').decode()
        original = self.records['ANON_KEY'].split('.')
        header = json.loads(base64.urlsafe_b64decode(original[0] + '=' * (-len(original[0]) % 4)))
        payload = json.loads(base64.urlsafe_b64decode(original[1] + '=' * (-len(original[1]) % 4)))
        for change in ('algorithm', 'issuer', 'boolean_iat', 'expiry_duration'):
            changed_header, changed_payload = dict(header), dict(payload)
            if change == 'algorithm':
                changed_header['alg'] = 'HS512'
            elif change == 'issuer':
                changed_payload['iss'] = 'other'
            elif change == 'boolean_iat':
                changed_payload['iat'] = True
            else:
                changed_payload['exp'] += 1
            data = encode(changed_header) + '.' + encode(changed_payload)
            signature = base64.urlsafe_b64encode(hmac.new(self.records['JWT_SECRET'].encode(), data.encode(), hashlib.sha256).digest()).rstrip(b'=').decode()
            records = dict(self.records, ANON_KEY=data + '.' + signature)
            with self.assertRaises(module.PreparationError):
                module.validate_records(records)

    def test_origin_refuses_credentials_and_unapproved_hosts(self):
        for value in ('http://api-test.dosorobotics.com', 'https://unapproved.example', 'https://user:synthetic@api-test.dosorobotics.com', module.PUBLIC_ORIGIN + '/path'):
            with self.assertRaises(module.PreparationError):
                module.public_origin(value)

    def test_template_hash_and_size_are_required(self):
        lock = json.loads((HERE / 'upstream.lock.json').read_bytes())
        with patch.object(module, 'read_regular', side_effect=[json.dumps(lock).encode(), b'changed-public-template']):
            with self.assertRaises(module.PreparationError):
                module.locked_template('/test/.env.example')

    def test_destination_rejects_unsafe_directory_and_existing_files(self):
        ancestor = SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=0)
        for info, contents in ((SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=0), []), (SimpleNamespace(st_mode=stat.S_IFDIR | 0o700, st_uid=1000), []), (SimpleNamespace(st_mode=stat.S_IFDIR | 0o700, st_uid=0), ['.env'])):
            with patch.object(module.os, 'O_DIRECTORY', 0x10000, create=True), patch.object(module.os, 'O_NOFOLLOW', 0x20000, create=True), patch.object(module.os, 'lstat', return_value=ancestor), patch.object(module.os, 'open', return_value=41), patch.object(module.os, 'fstat', return_value=info), patch.object(module.os, 'listdir', return_value=contents), patch.object(module.os, 'close'):
                with self.assertRaises(module.PreparationError):
                    module.open_destination(str(Path.cwd().anchor) + 'root/new-test/.env')
        symlink = SimpleNamespace(st_mode=stat.S_IFLNK | 0o777, st_uid=0)
        with patch.object(module.os, 'lstat', return_value=symlink), patch.object(module.os, 'open') as opened:
            with self.assertRaises(module.PreparationError):
                module.open_destination(str(Path.cwd().anchor) + 'root/new-test/.env')
            self.assertTrue(not opened.called, 'ancestor_symlink_must_not_be_opened')

    def test_existing_target_is_not_overwritten(self):
        with patch.object(module.os, 'O_NOFOLLOW', 0x20000, create=True), patch.object(module.os, 'open', side_effect=FileExistsError) as opened:
            with self.assertRaises(FileExistsError):
                module.write_environment(41, b'synthetic-noncredential')
            self.assertTrue(opened.call_args.kwargs['dir_fd'] == 41, 'held_directory_descriptor')
            self.assertTrue(opened.call_args.args[1] & os.O_EXCL and opened.call_args.args[1] & module.os.O_NOFOLLOW, 'exclusive_nofollow_open')
            self.assertTrue(opened.call_args.args[2] == 0o600, 'private_output_mode')

    def test_generator_timeout_cid_cleanup_and_uncertainty(self):
        for scenario in ('success', 'missing_cid', 'bad_cid', 'rm_failed', 'rm_timeout'):
            calls = []
            def fake_read(path, limit):
                if str(path).endswith('.mjs'):
                    return b'public-js-source'
                if scenario == 'missing_cid':
                    raise FileNotFoundError
                return b'not-a-cid' if scenario == 'bad_cid' else b'c' * 64
            def fake_run(command, **kwargs):
                calls.append((command, kwargs))
                if len(calls) == 1 or scenario == 'rm_timeout':
                    raise subprocess.TimeoutExpired(command, kwargs['timeout'])
                return SimpleNamespace(returncode=1 if scenario == 'rm_failed' else 0, stdout=b'', stderr=b'synthetic-private-diagnostic')
            with patch.object(module, 'read_regular', side_effect=fake_read), patch.object(module.tempfile, 'TemporaryDirectory', return_value=contextlib.nullcontext('/run/fake-private-client')), patch.object(module.os, 'chmod'), patch.object(module.os, 'listdir', return_value=[]), patch.object(module.secrets, 'token_hex', return_value='a' * 16), patch.object(module.subprocess, 'run', side_effect=fake_run):
                expected = 'key_generator_timeout' if scenario == 'success' else 'cleanup_unconfirmed'
                with self.assertRaisesRegex(module.PreparationError, '^' + expected + '$'):
                    module.generate_records()
            command, options = calls[0]
            self.assertTrue('--network' in command and command[command.index('--network') + 1] == 'none', 'network_isolation')
            self.assertTrue('--log-driver' in command and command[command.index('--log-driver') + 1] == 'none', 'container_log_disabled')
            self.assertTrue(module.IMAGE in command and '--read-only' in command and '--no-healthcheck' in command, 'fixed_offline_runner')
            self.assertTrue(command[command.index('--cidfile') + 1] == str(Path('/run/fake-private-client') / 'container.cid'), 'private_cidfile')
            self.assertTrue(options['capture_output'] and options['timeout'] == 30, 'private_bounded_pipe')
            if scenario in ('missing_cid', 'bad_cid'):
                self.assertTrue(len(calls) == 1, 'unknown_container_never_deleted')
            else:
                self.assertTrue(calls[1][0][-3:] == ['rm', '-f', 'c' * 64], 'only_captured_cid_deleted')

    def test_main_errors_do_not_echo_generator_values(self):
        captured = io.StringIO()
        with patch.object(module.os, 'name', 'nt'), contextlib.redirect_stdout(captured):
            status = module.main(['--template', '/test/.env.example', '--output', '/root/test/.env', '--public-origin', module.PUBLIC_ORIGIN])
        result = json.loads(captured.getvalue())
        self.assertTrue(status == 1 and result == {'status': 'failed', 'reason': 'linux_root_required'}, 'fixed_public_failure')
        self.assertTrue(all(value not in captured.getvalue() for value in self.records.values()), 'no_key_output')

    def test_main_success_only_reports_pending_mail(self):
        captured = io.StringIO()
        resource = SimpleNamespace(RLIMIT_CORE=4, setrlimit=lambda *_: None)
        with patch.object(module.os, 'name', 'posix'), patch.object(module.os, 'O_NOFOLLOW', 0x20000, create=True), patch.object(module.os, 'geteuid', return_value=0, create=True), patch.object(module.os, 'umask'), patch.dict(sys.modules, {'resource': resource}), patch.object(module, 'locked_template', return_value='SMTP_PASS=fake\n'), patch.object(module, 'open_destination', return_value=41), patch.object(module, 'generate_records', return_value=self.records), patch.object(module, 'write_environment') as written, patch.object(module.os, 'close'), contextlib.redirect_stdout(captured):
            status = module.main(['--template', '/test/.env.example', '--output', '/root/test/.env', '--public-origin', module.PUBLIC_ORIGIN])
        result = json.loads(captured.getvalue())
        self.assertTrue(status == 0 and result == {'status': 'pending_smtp', 'can_start': False, 'credentials_printed': False}, 'pending_only_result')
        self.assertTrue(written.called and all(value not in captured.getvalue() for value in self.records.values()), 'private_key_pipe_only')


if __name__ == '__main__':
    unittest.main()
