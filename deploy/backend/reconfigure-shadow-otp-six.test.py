import contextlib
import copy
import hashlib
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
from unittest.mock import MagicMock, patch

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('reconfigure_shadow_otp_six', HERE / 'reconfigure-shadow-otp-six.py')
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)
CORE_BYTES = (HERE / 'start-shadow-core.py').read_bytes()
CANDIDATE_BYTES = (HERE / 'verify-shadow-signup.py').read_bytes()
OVERLAY_BYTES = (HERE / 'compose.email-otp-six.yml').read_bytes()
SECRET = 'synthetic-only $ password and signing material'
DIRECTORY = SimpleNamespace(st_mode=stat.S_IFDIR | 0o700, st_uid=0)
FILE = SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_uid=0, st_nlink=1, st_size=100, st_dev=1, st_ino=2)


def model():
    return {'name': 'doso-backend-shadow', 'services': {'auth': {'environment': {module.OTP: '8', 'GOTRUE_SMTP_PASS': SECRET.replace('$', '$$')}, 'depends_on': {'db': {}, 'mail-templates': {}}}, 'db': {'image': 'synthetic-fixed-db', 'volumes': [{'source': 'unchanged-db-data'}]}, 'rest': {'image': 'synthetic-fixed-rest'}, 'mail-templates': {'image': 'synthetic-fixed-mail'}}}


class ReconfigureTests(unittest.TestCase):
    def test_four_sources_are_pinned_and_reviewed_core_is_loaded_without_main(self):
        self.assertEqual(hashlib.sha256(CORE_BYTES).hexdigest(), module.CORE_HASH)
        self.assertEqual(hashlib.sha256(CANDIDATE_BYTES).hexdigest(), module.CANDIDATE_HASH)
        self.assertEqual(hashlib.sha256(OVERLAY_BYTES).hexdigest(), module.OVERLAY_HASH)
        sources = {module.CORE_PATH: (CORE_BYTES, (1, 1)), module.CANDIDATE: (CANDIDATE_BYTES, (1, 2)), module.OVERLAY_SOURCE: (OVERLAY_BYTES, (1, 3)), module.INSTALLED: (b'synthetic old reviewed public source', (1, 4))}
        with patch.object(module, 'read_public_source', side_effect=lambda path, expected, *args: sources[path]) as read:
            core, candidate, overlay, original = module.reviewed_sources()
        self.assertEqual(core.__name__, 'doso_reviewed_otp_core')
        self.assertEqual(candidate, CANDIDATE_BYTES)
        self.assertEqual(overlay, OVERLAY_BYTES)
        self.assertEqual(original, (1, 4))
        self.assertEqual([call.args[:2] for call in read.call_args_list], [(module.CORE_PATH, module.CORE_HASH), (module.CANDIDATE, module.CANDIDATE_HASH), (module.OVERLAY_SOURCE, module.OVERLAY_HASH), (module.INSTALLED, module.INSTALLED_HASH)])
        self.assertEqual(read.call_args.args[2], 0o600)
        self.assertEqual(module.INSTALLED_HASH, 'b189a0c81fe5ff40aecee7c0b2d38ff14f41758a01284fa7538c4a97171dd667')

    def source_patches(self, stack, content=b'synthetic public code', directory=DIRECTORY, file=FILE):
        stack.enter_context(patch.object(module.os, 'O_DIRECTORY', 0x10000, create=True))
        stack.enter_context(patch.object(module.os, 'O_NOFOLLOW', 0x20000, create=True))
        stack.enter_context(patch.object(module.os, 'O_NONBLOCK', 0x800, create=True))
        opened = stack.enter_context(patch.object(module.os, 'open', side_effect=lambda path, *args, **kwargs: 20 if path.endswith('.py') else 10))
        stack.enter_context(patch.object(module.os, 'fstat', side_effect=lambda descriptor: file if descriptor == 20 else directory))
        stack.enter_context(patch.object(module.os, 'fdopen', return_value=contextlib.nullcontext(io.BytesIO(content))))
        closed = stack.enter_context(patch.object(module.os, 'close'))
        return opened, closed

    def test_public_source_reader_walks_root_owned_nofollow_and_checks_hash_and_private_mode(self):
        content = b'synthetic public code'
        with contextlib.ExitStack() as stack:
            opened, _ = self.source_patches(stack, content)
            read, identity = module.read_public_source(module.INSTALLED, hashlib.sha256(content).hexdigest(), 0o600)
            self.assertEqual(read, content)
            self.assertEqual(identity, (1, 2))
            self.assertTrue(all(call.args[1] & module.os.O_NOFOLLOW for call in opened.call_args_list))
            self.assertEqual(opened.call_args.args[0], 'verify-shadow-signup.py')
            self.assertTrue(opened.call_args.args[1] & module.os.O_NONBLOCK)
        with contextlib.ExitStack() as stack:
            self.source_patches(stack, content)
            with self.assertRaisesRegex(module.ReconfigureError, '^source_hash_mismatch$'):
                module.read_public_source(module.INSTALLED, '0' * 64, 0o600)
        with patch.object(module.os, 'open') as opened:
            with self.assertRaisesRegex(module.ReconfigureError, '^unapproved_source_path$'):
                module.read_public_source('/opt/doso-backend-shadow/env/.env', '0' * 64)
            opened.assert_not_called()

    def test_public_source_reader_rejects_unsafe_ancestors_links_owner_mode_and_hardlinks(self):
        for changes in ({'st_uid': 1000}, {'st_mode': stat.S_IFDIR | 0o777}, {'st_mode': stat.S_IFLNK | 0o777}, {'st_mode': stat.S_IFDIR | 0o755}):
            with contextlib.ExitStack() as stack:
                self.source_patches(stack, directory=SimpleNamespace(**(vars(DIRECTORY) | changes)))
                with self.assertRaises(module.ReconfigureError):
                    module.read_public_source(module.INSTALLED, '0' * 64, 0o600)
        for changes in ({'st_uid': 1000}, {'st_nlink': 2}, {'st_mode': stat.S_IFLNK | 0o600}, {'st_mode': stat.S_IFREG | 0o644}, {'st_size': 0}, {'st_size': 256 * 1024 + 1}):
            with contextlib.ExitStack() as stack:
                self.source_patches(stack, file=SimpleNamespace(**(vars(FILE) | changes)))
                with self.assertRaises(module.ReconfigureError):
                    module.read_public_source(module.INSTALLED, '0' * 64, 0o600)

    def test_actual_environment_is_read_only_for_the_preverified_auth_cid_and_kept_in_memory(self):
        docker = MagicMock()
        docker.run.return_value = json.dumps(['PATH=/usr/bin', module.OTP + '=8', 'GOTRUE_SMTP_PASS=' + SECRET]).encode()
        result = module.actual_environment(docker, 'a' * 64)
        self.assertTrue(result['GOTRUE_SMTP_PASS'] == SECRET)
        docker.run.assert_called_once_with(['container', 'inspect', 'a' * 64, '--format', '{{json .Config.Env}}'])
        docker.run.return_value = b'["DUPLICATE=a","DUPLICATE=b"]'
        with self.assertRaisesRegex(module.ReconfigureError, '^invalid_actual_auth_environment$'):
            module.actual_environment(docker, 'a' * 64)

    def test_old_actual_env_must_be_eight_and_match_all_configured_values_including_literal_dollars(self):
        configured = model()['services']['auth']['environment']
        actual = {module.OTP: '8', 'GOTRUE_SMTP_PASS': SECRET, 'PATH': '/usr/bin'}
        module.verify_configured_environment(configured, actual)
        for changed in (dict(actual, **{module.OTP: '6'}), dict(actual, GOTRUE_SMTP_PASS='wrong')):
            with self.assertRaises(module.ReconfigureError):
                module.verify_configured_environment(configured, changed)

    def test_full_seven_layer_model_may_change_only_the_auth_otp_length(self):
        before = model()
        after = copy.deepcopy(before)
        after['services']['auth']['environment'][module.OTP] = '6'
        module.verify_model_change(before, after)
        for change in (lambda value: value['services']['auth']['environment'].update(GOTRUE_SMTP_PASS='changed'), lambda value: value['services']['auth']['environment'].update(NEW_SECRET='new'), lambda value: value['services']['auth']['depends_on'].update(storage={}), lambda value: value['services']['db'].update(image='changed'), lambda value: value['services']['rest'].update(ports=[{'published': 5432}])):
            altered = copy.deepcopy(after)
            change(altered)
            with self.assertRaisesRegex(module.ReconfigureError, '^unexpected_compose_model_change$'):
                module.verify_model_change(before, altered)

    def file_patches(self, stack, identity=(1, 2), replace_error=None):
        core = SimpleNamespace(open_directory=MagicMock(return_value=10), WORK='/synthetic/work')
        stack.enter_context(patch.object(module.os, 'O_NOFOLLOW', 0x20000, create=True))
        opened = stack.enter_context(patch.object(module.os, 'open', return_value=30))
        written = io.BytesIO()
        stack.enter_context(patch.object(module.os, 'fdopen', return_value=contextlib.nullcontext(written)))
        synced = stack.enter_context(patch.object(module.os, 'fsync'))
        stack.enter_context(patch.object(module, 'read_public_source', return_value=(b'old public source', identity)))
        stack.enter_context(patch.object(module.os, 'stat', return_value=FILE))
        replaced = stack.enter_context(patch.object(module.os, 'replace', side_effect=replace_error))
        removed = stack.enter_context(patch.object(module.os, 'unlink'))
        stack.enter_context(patch.object(module.os, 'close'))
        return core, opened, written, synced, replaced, removed

    def test_overlay_is_created_exclusively_without_touching_the_existing_six_layers(self):
        with contextlib.ExitStack() as stack:
            core, opened, written, synced, replaced, removed = self.file_patches(stack)
            module.write_overlay(core, OVERLAY_BYTES)
            self.assertEqual(opened.call_args.args[0], 'compose.email-otp-six.yml')
            self.assertTrue(opened.call_args.args[1] & os.O_EXCL and opened.call_args.args[1] & module.os.O_NOFOLLOW)
            self.assertEqual(opened.call_args.args[2], 0o600)
            self.assertEqual(opened.call_args.kwargs, {'dir_fd': 10})
            self.assertEqual(written.getvalue(), OVERLAY_BYTES)
            self.assertEqual([call.args[0] for call in synced.call_args_list], [30, 10])
            replaced.assert_not_called()
            removed.assert_not_called()

    def test_script_replacement_is_private_synced_and_rechecks_old_hash_and_inode(self):
        with contextlib.ExitStack() as stack:
            core, opened, written, synced, replaced, removed = self.file_patches(stack)
            module.replace_test_script(core, b'synthetic new reviewed public source', (1, 2))
            self.assertTrue(opened.call_args.args[1] & os.O_EXCL and opened.call_args.args[1] & module.os.O_NOFOLLOW)
            self.assertEqual(opened.call_args.args[2], 0o600)
            self.assertEqual(replaced.call_args.args[1], 'verify-shadow-signup.py')
            self.assertEqual(replaced.call_args.kwargs, {'src_dir_fd': 10, 'dst_dir_fd': 10})
            self.assertEqual([call.args[0] for call in synced.call_args_list], [30, 10])
            removed.assert_not_called()

    def test_script_drift_or_replace_failure_removes_only_the_private_temporary(self):
        for identity, error in (((1, 99), None), ((1, 2), OSError('synthetic private error'))):
            with contextlib.ExitStack() as stack:
                core, opened, _, _, replaced, removed = self.file_patches(stack, identity, error)
                with self.assertRaises((module.ReconfigureError, OSError)):
                    module.replace_test_script(core, b'synthetic public candidate', (1, 2))
                removed.assert_called_once_with(opened.call_args.args[0], dir_fd=10)
                if error is None:
                    replaced.assert_not_called()

    def mocked_main(self, failure=None):
        before = model()
        after = copy.deepcopy(before)
        after['services']['auth']['environment'][module.OTP] = '6'
        if failure == 'model':
            after['services']['rest']['image'] = 'changed'
        old_ids = {'db': 'a' * 64, 'auth': 'b' * 64, 'rest': 'c' * 64, 'mail-templates': 'd' * 64}
        new_ids = dict(old_ids, auth='e' * 64)
        if failure == 'db_id':
            new_ids['db'] = 'f' * 64
        old_env = {module.OTP: '8', 'GOTRUE_SMTP_PASS': SECRET, 'PATH': '/usr/bin'}
        new_env = dict(old_env, **{module.OTP: '6'})
        if failure == 'actual_env':
            new_env['GOTRUE_SMTP_PASS'] = 'changed'
        docker = MagicMock()
        docker.compose = ['compose', '--project-name', 'doso-backend-shadow']
        docker.verify_started.side_effect = [old_ids, old_ids, new_ids, new_ids]
        def run(args, **kwargs):
            if 'up' in args:
                if failure == 'up':
                    raise subprocess.TimeoutExpired('synthetic private command', 120, output=SECRET.encode())
                return b''
            if args[-3:] == ['config', '--format', 'json']:
                return json.dumps(after if '-f' in args else before).encode()
            environment = old_env if args[2] == old_ids['auth'] else new_env
            return json.dumps([key + '=' + value for key, value in environment.items()]).encode()
        docker.run.side_effect = run
        core = SimpleNamespace(WORK='/synthetic/work', GuardError=type('ReviewedGuardError', (Exception,), {}), lock_environment=MagicMock(return_value=(10, 20)), validate_runtime=MagicMock(), validate_model=MagicMock(), website_snapshot=MagicMock(side_effect=[{'nginx': 'a', 'http': 'b'}, {'nginx': 'changed' if failure == 'website' else 'a', 'http': 'b'}]), Docker=MagicMock(return_value=docker), main=MagicMock(side_effect=AssertionError('core main forbidden')), prepare_data=MagicMock(side_effect=AssertionError('core prepare_data forbidden')))
        resource = SimpleNamespace(RLIMIT_CORE=4, setrlimit=MagicMock())
        output = io.StringIO()
        with patch.object(module.sys, 'platform', 'linux'), patch.object(module.os, 'geteuid', return_value=0, create=True), patch.dict(sys.modules, {'resource': resource}), patch.object(module.os, 'umask'), patch.object(module, 'reviewed_sources', return_value=(core, b'synthetic candidate', OVERLAY_BYTES, (1, 2))), patch.object(module.tempfile, 'TemporaryDirectory', return_value=contextlib.nullcontext('/run/synthetic-private')), patch.object(module.os, 'chmod'), patch.object(module.os, 'listdir', return_value=[]), patch.object(module.os, 'close'), patch.object(module, 'write_overlay') as overlay, patch.object(module, 'replace_test_script', side_effect=OSError(SECRET) if failure == 'script' else None) as replace, contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            result = module.main([])
        return result, core, docker, overlay, replace, output.getvalue()

    def test_main_reuses_reviewed_core_without_first_start_paths_and_recreates_only_auth_once(self):
        result, core, docker, overlay, replace, output = self.mocked_main()
        self.assertEqual(result, 0)
        core.main.assert_not_called()
        core.prepare_data.assert_not_called()
        docker.preflight.assert_not_called()
        core.validate_runtime.assert_called_once()
        self.assertEqual(core.validate_model.call_count, 2)
        starts = [call.args[0] for call in docker.run.call_args_list if 'up' in call.args[0]]
        self.assertEqual(len(starts), 1)
        self.assertEqual(starts[0][starts[0].index('up'):], ['up', '--no-deps', '-d', '--wait', '--wait-timeout', '90', '--pull', 'never', 'auth'])
        docker.probe.assert_called_once_with('c' * 64)
        overlay.assert_called_once()
        replace.assert_called_once()
        final = json.loads(output.splitlines()[-1])
        self.assertTrue(final['other_service_ids_unchanged'])
        self.assertTrue(final['auth_environment_only_otp_changed'])
        self.assertTrue(final['website_preserved'])
        self.assertFalse(final['signup_performed'])
        self.assertNotIn(SECRET, output)

    def test_failure_never_rolls_back_retries_or_changes_the_test_script_before_all_checks(self):
        for failure, changed in (('model', False), ('up', True), ('db_id', True), ('actual_env', True), ('website', True), ('script', True)):
            result, _, docker, _, replace, output = self.mocked_main(failure)
            self.assertEqual(result, 1)
            commands = [call.args[0] for call in docker.run.call_args_list]
            self.assertEqual(sum('up' in command for command in commands), 0 if failure == 'model' else 1)
            self.assertFalse(any('down' in command or 'rm' in command or 'restart' in command for command in commands))
            if failure != 'script':
                replace.assert_not_called()
            final = json.loads(output.splitlines()[-1])
            self.assertEqual(final['auth_may_have_changed'], changed)
            self.assertEqual(final['test_script_may_have_changed'], failure == 'script')
            self.assertNotIn(SECRET, output)

    def test_main_rejects_arguments_without_echoing_or_loading_reviewed_sources(self):
        output = io.StringIO()
        with patch.object(module, 'reviewed_sources') as sources, contextlib.redirect_stdout(output):
            self.assertEqual(module.main([SECRET]), 1)
        sources.assert_not_called()
        self.assertNotIn(SECRET, output.getvalue())


if __name__ == '__main__':
    unittest.main()
