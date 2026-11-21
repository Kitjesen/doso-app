import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('shadow_smtp', HERE / 'configure-shadow-smtp.py')
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)
PENDING = module.PENDING + b"JWT_SECRET='synthetic-new-key'\nSUPABASE_PUBLIC_URL='https://api-test.dosorobotics.com'\nAPI_EXTERNAL_URL='https://api-test.dosorobotics.com/auth/v1'\n"
FILE = SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_uid=0, st_nlink=1, st_size=len(PENDING), st_dev=1, st_ino=2)


class ShadowSmtpTests(unittest.TestCase):
    def test_render_preserves_every_original_byte_and_adds_only_fixed_smtp(self):
        rendered = module.render_environment(PENDING, 'synthetic-only')
        self.assertTrue(rendered.startswith(PENDING), 'original_bytes_preserved')
        added = rendered[len(PENDING):].decode().splitlines()
        self.assertEqual({line.split('=', 1)[0] for line in added}, set(module.SMTP) | {'SMTP_PASS'})
        for key, value in module.SMTP.items():
            self.assertIn(key + '="' + value + '"', added)
        self.assertEqual(module.TARGET, '/opt/doso-backend-shadow/env/.env')

    def test_invalid_or_already_configured_environments_are_rejected(self):
        for content in (b'old-environment\n', PENDING[:-1], PENDING + b'\x00', PENDING.replace(b'api-test', b'production'), PENDING + b'SMTP_PASS=synthetic\n', PENDING + b' export SMTP_HOST=synthetic\n', PENDING + b'"SMTP_PORT"=465\n', PENDING + b'\xff\n'):
            with self.subTest(case='invalid_environment'), self.assertRaises(module.ConfigurationError):
                module.render_environment(content, 'synthetic-only')

    def test_password_rejects_empty_control_and_excessive_input(self):
        for value in ('', 'x\ny', 'x\ry', 'x\x00y', 'x\ty', '\x7f', 'x' * 4097):
            with self.assertRaisesRegex(module.ConfigurationError, '^invalid_smtp_password$'):
                module.render_environment(PENDING, value)

    def test_file_refuses_unsafe_modes_owner_type_links_and_size(self):
        module.validate_file(FILE)
        for changes in ({'st_mode': stat.S_IFREG | 0o644}, {'st_uid': 1000}, {'st_nlink': 2}, {'st_mode': stat.S_IFLNK | 0o600}, {'st_mode': stat.S_IFIFO | 0o600}, {'st_size': 0}, {'st_size': module.LIMIT + 1}):
            with self.assertRaises(module.ConfigurationError):
                module.validate_file(SimpleNamespace(**(vars(FILE) | changes)))

    def test_read_is_bounded_even_if_file_grows(self):
        with patch.object(module.os, 'lseek'), patch.object(module.os, 'fdopen', return_value=contextlib.nullcontext(io.BytesIO(b'x' * (module.LIMIT + 1)))):
            with self.assertRaisesRegex(module.ConfigurationError, '^environment_too_large$'):
                module.read_environment(20)

    def test_terminal_requires_all_three_streams_and_real_fds(self):
        for denied in (0, 1, 2):
            streams = [SimpleNamespace(isatty=lambda: True, fileno=lambda number=number: number) for number in range(3)]
            with patch.object(module.sys, 'stdin', streams[0]), patch.object(module.sys, 'stdout', streams[1]), patch.object(module.sys, 'stderr', streams[2]), patch.object(module.os, 'isatty', side_effect=lambda number: number != denied):
                with self.assertRaises(module.ConfigurationError):
                    module.require_terminal()

    def test_password_is_requested_twice_and_never_falls_back_to_echo(self):
        with patch.object(module, 'require_terminal'), patch.object(module.getpass, 'getpass', side_effect=['synthetic', 'synthetic']) as prompt:
            self.assertTrue(module.prompt_password() == 'synthetic', 'double_input_match')
            self.assertEqual(prompt.call_count, 2)
            self.assertTrue(all(call.kwargs['stream'] is sys.stderr for call in prompt.call_args_list))
        with patch.object(module, 'require_terminal'), patch.object(module.getpass, 'getpass', side_effect=['synthetic', 'different']):
            with self.assertRaisesRegex(module.ConfigurationError, '^password_confirmation_mismatch$'):
                module.prompt_password()
        def fallback(*args, **kwargs):
            module.warnings.warn('synthetic warning', module.getpass.GetPassWarning)
            self.fail('echo_fallback_must_not_run')
        with patch.object(module, 'require_terminal'), patch.object(module.getpass, 'getpass', side_effect=fallback):
            with self.assertRaises(module.getpass.GetPassWarning):
                module.prompt_password()

    def test_directory_walk_uses_root_anchored_descriptors_and_nofollow(self):
        ordinary = SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=0)
        private = SimpleNamespace(st_mode=stat.S_IFDIR | 0o700, st_uid=0)
        with patch.object(module.os, 'O_DIRECTORY', 0x10000, create=True), patch.object(module.os, 'O_NOFOLLOW', 0x20000, create=True), patch.object(module.os, 'open', side_effect=[10, 11, 12, 13]) as opened, patch.object(module.os, 'fstat', side_effect=[ordinary, ordinary, ordinary, private]), patch.object(module.os, 'close') as closed:
            self.assertEqual(module.open_directory(), 13)
            self.assertEqual([call.args[0] for call in opened.call_args_list], ['/', 'opt', 'doso-backend-shadow', 'env'])
            self.assertEqual([call.kwargs.get('dir_fd') for call in opened.call_args_list], [None, 10, 11, 12])
            self.assertTrue(all(call.args[1] & module.os.O_NOFOLLOW for call in opened.call_args_list))
            self.assertEqual([call.args[0] for call in closed.call_args_list], [10, 11, 12])

    def test_directory_refuses_unsafe_ancestors_and_nonprivate_parent(self):
        ordinary = SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=0)
        for info in (SimpleNamespace(st_mode=stat.S_IFDIR | 0o777, st_uid=0), SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=1000), SimpleNamespace(st_mode=stat.S_IFLNK | 0o777, st_uid=0)):
            with patch.object(module.os, 'O_DIRECTORY', 0x10000, create=True), patch.object(module.os, 'O_NOFOLLOW', 0x20000, create=True), patch.object(module.os, 'open', return_value=10), patch.object(module.os, 'fstat', return_value=info), patch.object(module.os, 'close') as closed:
                with self.assertRaises(module.ConfigurationError):
                    module.open_directory()
                closed.assert_called_once_with(10)
        with patch.object(module.os, 'O_DIRECTORY', 0x10000, create=True), patch.object(module.os, 'O_NOFOLLOW', 0x20000, create=True), patch.object(module.os, 'open', side_effect=[10, 11, 12, 13]), patch.object(module.os, 'fstat', return_value=ordinary), patch.object(module.os, 'close'):
            with self.assertRaisesRegex(module.ConfigurationError, '^private_root_directory_required$'):
                module.open_directory()

    def atomic_patches(self, stack, current=FILE, readback=PENDING, replace_error=None, fsync_error=None):
        stack.enter_context(patch.object(module.os, 'O_NOFOLLOW', 0x20000, create=True))
        opened = stack.enter_context(patch.object(module.os, 'open', return_value=30))
        stack.enter_context(patch.object(module.os, 'fstat', return_value=FILE))
        stack.enter_context(patch.object(module.os, 'stat', return_value=current))
        stack.enter_context(patch.object(module, 'read_environment', return_value=readback))
        destination = io.BytesIO()
        stack.enter_context(patch.object(module.os, 'fdopen', return_value=contextlib.nullcontext(destination)))
        synced = stack.enter_context(patch.object(module.os, 'fsync', side_effect=fsync_error))
        replaced = stack.enter_context(patch.object(module.os, 'replace', side_effect=replace_error))
        removed = stack.enter_context(patch.object(module.os, 'unlink'))
        stack.enter_context(patch.object(module.os, 'close'))
        return opened, synced, replaced, removed, destination

    def test_atomic_write_is_exclusive_private_relative_and_synced(self):
        with contextlib.ExitStack() as stack:
            opened, synced, replaced, removed, destination = self.atomic_patches(stack)
            module.atomic_update(10, 20, PENDING, PENDING + b'SMTP_PASS="synthetic"\n')
            self.assertTrue(opened.call_args.args[1] & os.O_EXCL and opened.call_args.args[1] & module.os.O_NOFOLLOW)
            self.assertEqual(opened.call_args.args[2], 0o600)
            self.assertEqual(opened.call_args.kwargs, {'dir_fd': 10})
            self.assertEqual([call.args[0] for call in synced.call_args_list], [30, 10])
            self.assertEqual(replaced.call_args.args[1], '.env')
            self.assertEqual(replaced.call_args.kwargs, {'src_dir_fd': 10, 'dst_dir_fd': 10})
            self.assertTrue(destination.getvalue().startswith(PENDING))
            removed.assert_not_called()

    def test_changed_file_or_content_cannot_be_overwritten(self):
        for current, content in ((SimpleNamespace(**(vars(FILE) | {'st_ino': 99})), PENDING), (FILE, PENDING + b'# changed\n')):
            with contextlib.ExitStack() as stack:
                _, _, replaced, removed, _ = self.atomic_patches(stack, current=current, readback=content)
                with self.assertRaisesRegex(module.ConfigurationError, '^environment_changed$'):
                    module.atomic_update(10, 20, PENDING, b'synthetic')
                replaced.assert_not_called()
                removed.assert_called_once()

    def test_failed_replace_removes_only_temporary_file(self):
        with contextlib.ExitStack() as stack:
            opened, _, _, removed, _ = self.atomic_patches(stack, replace_error=OSError('synthetic private diagnostic'))
            with self.assertRaises(OSError):
                module.atomic_update(10, 20, PENDING, b'synthetic')
            removed.assert_called_once_with(opened.call_args.args[0], dir_fd=10)

    def test_post_replace_sync_failure_is_reported_as_uncertain(self):
        with contextlib.ExitStack() as stack:
            _, _, replaced, removed, _ = self.atomic_patches(stack, fsync_error=[None, OSError('synthetic')])
            with self.assertRaisesRegex(module.ConfigurationError, '^update_durability_unconfirmed$'):
                module.atomic_update(10, 20, PENDING, b'synthetic')
            replaced.assert_called_once()
            removed.assert_not_called()

    def test_configure_locks_both_directory_and_source_and_closes(self):
        flock = SimpleNamespace(LOCK_EX=2, LOCK_NB=4, flock=lambda *args: None)
        with patch.dict(sys.modules, {'fcntl': flock}), patch.object(flock, 'flock') as locked, patch.object(module, 'open_directory', return_value=10), patch.object(module.os, 'O_NOFOLLOW', 0x20000, create=True), patch.object(module.os, 'O_NONBLOCK', 0x800, create=True), patch.object(module.os, 'open', return_value=20) as opened, patch.object(module.os, 'fstat', return_value=FILE), patch.object(module, 'read_environment', return_value=PENDING), patch.object(module, 'prompt_password', return_value='synthetic') as prompted, patch.object(module, 'atomic_update') as updated, patch.object(module.os, 'close') as closed:
            module.configure()
            self.assertEqual([call.args for call in locked.call_args_list], [(10, 6), (20, 6)])
            self.assertEqual(opened.call_args.args[0], '.env')
            self.assertTrue(opened.call_args.args[1] & module.os.O_NONBLOCK)
            self.assertTrue(opened.call_args.args[1] & module.os.O_NOFOLLOW)
            self.assertEqual(opened.call_args.kwargs, {'dir_fd': 10})
            prompted.assert_called_once()
            updated.assert_called_once()
            self.assertEqual([call.args[0] for call in closed.call_args_list], [20, 10])

    def test_lock_conflict_stops_before_open_and_prompt(self):
        flock = SimpleNamespace(LOCK_EX=2, LOCK_NB=4, flock=lambda *args: None)
        with patch.dict(sys.modules, {'fcntl': flock}), patch.object(flock, 'flock', side_effect=BlockingIOError), patch.object(module, 'open_directory', return_value=10), patch.object(module.os, 'open') as opened, patch.object(module, 'prompt_password') as prompted, patch.object(module.os, 'close') as closed:
            with self.assertRaises(BlockingIOError):
                module.configure()
            opened.assert_not_called()
            prompted.assert_not_called()
            closed.assert_called_once_with(10)

    def test_existing_smtp_stops_before_password_prompt_or_write(self):
        flock = SimpleNamespace(LOCK_EX=2, LOCK_NB=4, flock=lambda *args: None)
        with patch.dict(sys.modules, {'fcntl': flock}), patch.object(module, 'open_directory', return_value=10), patch.object(module.os, 'O_NOFOLLOW', 0x20000, create=True), patch.object(module.os, 'O_NONBLOCK', 0x800, create=True), patch.object(module.os, 'open', return_value=20), patch.object(module.os, 'fstat', return_value=FILE), patch.object(module, 'read_environment', return_value=PENDING + b'SMTP_PASS="synthetic"\n'), patch.object(module, 'prompt_password') as prompted, patch.object(module, 'atomic_update') as updated, patch.object(module.os, 'close') as closed:
            with self.assertRaisesRegex(module.ConfigurationError, '^smtp_already_present$'):
                module.configure()
            prompted.assert_not_called()
            updated.assert_not_called()
            self.assertEqual([call.args[0] for call in closed.call_args_list], [20, 10])

    def test_mocked_main_errors_are_fixed_and_never_echo_arguments(self):
        output = io.StringIO()
        with patch.object(module, 'configure') as configured, contextlib.redirect_stdout(output):
            self.assertEqual(module.main(['synthetic-must-not-echo']), 1)
        self.assertEqual(json.loads(output.getvalue()), {'status': 'failed', 'reason': 'arguments_not_allowed'})
        configured.assert_not_called()

    def test_mocked_main_guards_root_terminal_and_redacts_unknown_errors(self):
        resource = SimpleNamespace(RLIMIT_CORE=4, setrlimit=lambda *args: None)
        scenarios = [('linux', 1000, None, None, 'linux_root_required'), ('win32', 0, None, None, 'linux_root_required'), ('linux', 0, module.ConfigurationError('interactive_terminal_required'), None, 'interactive_terminal_required'), ('linux', 0, None, OSError('synthetic-must-not-echo'), 'smtp_configuration_failed'), ('linux', 0, None, KeyboardInterrupt(), 'interrupted')]
        for platform, uid, terminal_error, configure_error, reason in scenarios:
            output = io.StringIO()
            with patch.object(module.sys, 'platform', platform), patch.object(module.os, 'geteuid', return_value=uid, create=True), patch.object(module.os, 'O_NOFOLLOW', 0x20000, create=True), patch.object(module, 'require_terminal', side_effect=terminal_error), patch.object(module.os, 'umask'), patch.dict(sys.modules, {'resource': resource}), patch.object(module, 'configure', side_effect=configure_error), contextlib.redirect_stdout(output):
                self.assertEqual(module.main([]), 1)
            self.assertEqual(json.loads(output.getvalue()), {'status': 'failed', 'reason': reason})

    def test_mocked_main_success_claims_configuration_only(self):
        output = io.StringIO()
        resource = SimpleNamespace(RLIMIT_CORE=4, setrlimit=lambda *args: None)
        with patch.object(module.sys, 'platform', 'linux'), patch.object(module.os, 'geteuid', return_value=0, create=True), patch.object(module.os, 'O_NOFOLLOW', 0x20000, create=True), patch.object(module, 'require_terminal'), patch.object(module.os, 'umask'), patch.dict(sys.modules, {'resource': resource}), patch.object(module, 'configure') as configured, contextlib.redirect_stdout(output):
            self.assertEqual(module.main([]), 0)
        configured.assert_called_once()
        self.assertEqual(json.loads(output.getvalue()), {'status': 'smtp_configured', 'credentials_printed': False, 'delivery_verified': False})

    def test_real_compose_config_roundtrips_synthetic_boundary_values_without_engine(self):
        docker = shutil.which('docker')
        if not docker:
            self.skipTest('local Docker Compose CLI unavailable; no daemon is needed')
        values = ['synthetic-only', '$VAR', '${UNSET:-wrong}', '$$ and $$$', "single'quote", 'double"quote', 'back\\slash', '\\', "slash\\'quote", 'trailing\\\\', 'slash\\$VAR', ' # = whitespace ', '中文 synthetic']
        with tempfile.TemporaryDirectory(prefix='doso-smtp-synthetic-') as temporary:
            root = Path(temporary)
            environment_file = root / '.env'
            # Only synthetic strings are ever written or passed to Compose.
            lines = []
            for index, value in enumerate(values):
                rendered = module.render_environment(PENDING, value)
                line = rendered[len(PENDING):].decode().splitlines()[-1]
                lines.append('CASE_' + str(index) + line[len('SMTP_PASS'):])
            environment_file.write_text('\n'.join(lines) + '\n', encoding='utf-8')
            compose_file = root / 'compose.yml'
            compose_file.write_text('services:\n  synthetic:\n    image: synthetic:unused\n    environment:\n' + ''.join('      CASE_' + str(index) + ': ${CASE_' + str(index) + ':?missing}\n' for index in range(len(values))), encoding='utf-8')
            config = root / 'docker-client'
            config.mkdir()
            plugins = Path(docker).parent.parent / 'cli-plugins'
            if os.name == 'nt' and plugins.is_dir():
                (config / 'config.json').write_text(json.dumps({'cliPluginsExtraDirs': [str(plugins)]}), encoding='utf-8')
            environment = {key: os.environ[key] for key in ('PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP') if key in os.environ}
            environment.update({'HOME': temporary, 'USERPROFILE': temporary, 'DOCKER_CONFIG': str(config)})
            command = [docker, '--config', str(config), 'compose', '--project-directory', temporary, '--env-file', str(environment_file), '-f', str(compose_file), 'config']
            result = subprocess.run(command + ['--environment'], capture_output=True, timeout=30, env=environment, check=False)
            self.assertTrue(result.returncode == 0, 'compose_environment_failed_without_printing_output')
            parsed = dict(line.split('=', 1) for line in result.stdout.decode('utf-8').splitlines() if '=' in line)
            self.assertTrue(all(parsed.get('CASE_' + str(index)) == value for index, value in enumerate(values)), 'dotenv_exact_roundtrip')
            result = subprocess.run(command + ['--format', 'json'], capture_output=True, timeout=30, env=environment, check=False)
            self.assertTrue(result.returncode == 0, 'compose_config_failed_without_printing_output')
            parsed = json.loads(result.stdout)['services']['synthetic']['environment']
            # Compose re-escapes dollars when serializing the runnable config.
            self.assertTrue(all(parsed.get('CASE_' + str(index)) == value.replace('$', '$$') for index, value in enumerate(values)), 'compose_interpolation_exact_roundtrip')


if __name__ == '__main__':
    unittest.main()
