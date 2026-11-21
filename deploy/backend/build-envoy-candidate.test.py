"""Synthetic and mocked checks only; never call main or a Docker daemon."""
import hashlib
import importlib.util
import json
from pathlib import Path
import stat
import subprocess
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, mock_open, patch

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('build_envoy_candidate', HERE / 'build-envoy-candidate.py')
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)
IMAGE_ID = 'sha256:' + 'a' * 64
CID = 'b' * 64
NONCE = 'c' * 32


def image(**changes):
    record = {'id': IMAGE_ID, 'architecture': 'amd64', 'os': 'linux', 'onbuild': None, 'labels': module.LABELS.copy()}
    record.update(changes)
    return record


class CandidateTests(unittest.TestCase):
    def setUp(self):
        for name, value in (('O_DIRECTORY', 0x10000), ('O_NOFOLLOW', 0x20000), ('O_NONBLOCK', 0x800)):
            mock = patch.object(module.os, name, getattr(module.os, name, value), create=True)
            mock.start()
            self.addCleanup(mock.stop)

    def test_reviewed_sources_match_fixed_hashes_and_dockerfile_is_offline_copy_only(self):
        self.assertEqual(hashlib.sha256((HERE / 'envoy-safe-entrypoint.mjs').read_bytes()).hexdigest(), module.WRAPPER_HASH)
        content = (HERE / 'Dockerfile.envoy-candidate').read_bytes()
        self.assertEqual(hashlib.sha256(content).hexdigest(), module.DOCKERFILE_HASH)
        instructions = [line for line in content.decode().splitlines() if line and not line.startswith('#')]
        self.assertEqual(instructions, ['FROM ' + module.BASE, 'COPY envoy /app/envoy', 'COPY envoy-safe-entrypoint.mjs /app/envoy-safe-entrypoint.mjs', 'USER 1000:1000', 'ENTRYPOINT ["node", "/app/envoy-safe-entrypoint.mjs"]', 'CMD []'])

    def test_directory_walk_checks_each_ancestor_and_never_follows_links(self):
        safe = SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=0)
        with patch.object(module.os, 'open', side_effect=[10, 11, 12]) as opened, patch.object(module.os, 'fstat', return_value=safe), patch.object(module.os, 'close'):
            self.assertEqual(module.directory('/opt/candidate'), 12)
            self.assertEqual(opened.call_count, 3)
            self.assertTrue(all(call.args[1] & module.os.O_NOFOLLOW and call.args[1] & module.os.O_DIRECTORY for call in opened.call_args_list))
        for info in (SimpleNamespace(st_mode=stat.S_IFDIR | 0o775, st_uid=0), SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=1000), SimpleNamespace(st_mode=stat.S_IFLNK | 0o777, st_uid=0)):
            with patch.object(module.os, 'open', return_value=10), patch.object(module.os, 'fstat', return_value=info), patch.object(module.os, 'close') as close:
                with self.assertRaises(module.GuardError):
                    module.directory('/opt/candidate')
                close.assert_called_once_with(10)

    def test_source_metadata_change_fails_even_when_hash_matches(self):
        payload = b'synthetic'
        fields = dict(st_mode=stat.S_IFREG | 0o644, st_uid=0, st_nlink=1, st_size=len(payload), st_mtime_ns=1, st_ctime_ns=2)
        before = SimpleNamespace(**fields)
        after = SimpleNamespace(**dict(fields, st_ctime_ns=3))
        with patch.object(module, 'directory', return_value=10), patch.object(module.os, 'open', side_effect=[11, 12]), patch.object(module.os, 'fstat', side_effect=[before, after]), patch.object(module.os, 'read', side_effect=[payload, b'']), patch.object(module.os, 'write', side_effect=lambda fd, value: len(value)), patch.object(module.os, 'close'), patch.object(module.os, 'fchmod', create=True) as chmod:
            with self.assertRaises(module.GuardError):
                module.copy_verified('/public/source', 20, 'envoy', hashlib.sha256(payload).hexdigest(), len(payload), 0o555)
            chmod.assert_not_called()

    def test_stream_copy_hash_size_single_link_no_follow_and_explicit_modes(self):
        payload = b'synthetic public bytes'
        before = SimpleNamespace(st_mode=stat.S_IFREG | 0o644, st_uid=0, st_nlink=1, st_size=len(payload), st_mtime_ns=1, st_ctime_ns=2)
        for mode in (0o555, 0o444):
            final = SimpleNamespace(st_mode=stat.S_IFREG | mode, st_uid=0, st_nlink=1, st_size=len(payload))
            with patch.object(module, 'directory', return_value=10), patch.object(module.os, 'open', side_effect=[11, 12]) as opened, patch.object(module.os, 'fstat', side_effect=[before, before, final]), patch.object(module.os, 'read', side_effect=[payload[:3], payload[3:], b'']), patch.object(module.os, 'write', side_effect=lambda fd, value: min(2, len(value))) as write, patch.object(module.os, 'fchmod', create=True) as chmod, patch.object(module.os, 'fsync'), patch.object(module.os, 'close'):
                module.copy_verified('/public/source', 20, 'envoy', hashlib.sha256(payload).hexdigest(), len(payload), mode)
                self.assertTrue(all(call.args[1] & module.os.O_NOFOLLOW for call in opened.call_args_list))
                self.assertTrue(opened.call_args_list[1].args[1] & module.os.O_EXCL)
                chmod.assert_called_once_with(12, mode)
                self.assertGreater(write.call_count, 2)

    def test_copy_rejects_wrong_hash_and_unsafe_or_changed_source_before_chmod(self):
        payload = b'synthetic'
        regular = dict(st_mode=stat.S_IFREG | 0o644, st_uid=0, st_nlink=1, st_size=len(payload), st_mtime_ns=1, st_ctime_ns=2)
        for changes in ({'st_mode': stat.S_IFLNK | 0o777}, {'st_nlink': 2}, {'st_mode': stat.S_IFREG | 0o666}, {'st_uid': 1000}, {'st_size': 1}, {}):
            before = SimpleNamespace(**dict(regular, **changes))
            with patch.object(module, 'directory', return_value=10), patch.object(module.os, 'open', side_effect=[11, 12]), patch.object(module.os, 'fstat', return_value=before), patch.object(module.os, 'read', side_effect=[payload, b'']), patch.object(module.os, 'write', side_effect=lambda fd, value: len(value)), patch.object(module.os, 'close'), patch.object(module.os, 'fchmod', create=True) as chmod:
                with self.assertRaises(module.GuardError):
                    module.copy_verified('/public/source', 20, 'envoy', '0' * 64, len(payload), 0o555)
                chmod.assert_not_called()

    def test_existing_candidate_directory_is_not_reused_or_removed(self):
        with patch.object(module.os, 'mkdir', side_effect=FileExistsError), patch.object(module, 'copy_verified') as copy:
            with self.assertRaises(FileExistsError):
                module.prepare_context(10)
            copy.assert_not_called()

    def test_context_contains_only_three_explicit_public_sources(self):
        with patch.object(module.os, 'mkdir') as mkdir, patch.object(module, 'directory', side_effect=[11, 12]), patch.object(module.os, 'close'), patch.object(module.os, 'fsync'), patch.object(module.os, 'listdir', return_value=['envoy', 'envoy-safe-entrypoint.mjs', 'Dockerfile']), patch.object(module, 'public_size', return_value=100), patch.object(module, 'copy_verified') as copy:
            module.prepare_context(10)
        self.assertEqual([call.args[:3] for call in copy.call_args_list], [(module.BINARY, 12, 'envoy'), (module.ROOT + '/tools/envoy-safe-entrypoint.mjs', 12, 'envoy-safe-entrypoint.mjs'), (module.ROOT + '/tools/Dockerfile.envoy-candidate', 12, 'Dockerfile')])
        self.assertEqual([call.args[5] for call in copy.call_args_list], [0o555, 0o444, 0o444])
        self.assertEqual(mkdir.call_args_list[0].kwargs, {'dir_fd': 10})

    def test_docker_environment_is_private_and_does_not_inherit_process_secrets(self):
        docker = module.Docker('/run/synthetic')
        result = SimpleNamespace(returncode=0, stdout=b'public', stderr=b'')
        with patch.object(module.subprocess, 'run', return_value=result) as run:
            self.assertEqual(docker.run(['image', 'ls']), b'public')
        args, kwargs = run.call_args
        self.assertEqual(args[0][:5], ['/usr/bin/docker', '--config', '/run/synthetic', '--host', 'unix:///run/docker.sock'])
        self.assertEqual(kwargs['env'], {'PATH': '/usr/bin:/bin', 'HOME': '/run/synthetic', 'DOCKER_CONFIG': '/run/synthetic', 'DOCKER_BUILDKIT': '0', 'LANG': 'C', 'LC_ALL': 'C'})
        self.assertEqual(kwargs['stdin'], subprocess.DEVNULL)
        self.assertEqual(kwargs['cwd'], '/run/synthetic')

    def test_build_is_single_bounded_offline_legacy_command_with_fixed_labels(self):
        docker = module.Docker('/run/synthetic')
        docker.run = Mock(side_effect=[b'', json.dumps(image()).encode(), b'build output discarded', json.dumps(image()).encode()])
        self.assertEqual(docker.build(), IMAGE_ID)
        build = docker.run.call_args_list[2]
        self.assertEqual(build.kwargs, {'timeout': 120})
        self.assertEqual(build.args[0][0], 'build')
        for option in ('--pull=false', '--network=none', '--memory=768m', '--memory-swap=768m', '--cpu-quota=50000'):
            self.assertIn(option, build.args[0])
        self.assertEqual(build.args[0][-3:], ['--tag', module.TAG, module.CONTEXT])
        self.assertEqual(sum(call.args[0][0] == 'build' for call in docker.run.call_args_list), 1)
        self.assertTrue(all(key + '=' + value in build.args[0] for key, value in module.LABELS.items()))

    def test_existing_tag_bad_platform_onbuild_or_build_failure_stops_without_retry(self):
        cases = [[b'existing'], [b'', json.dumps(image(architecture='arm64')).encode()], [b'', json.dumps(image(onbuild=['RUN unsafe'])).encode()], [b'', json.dumps(image()).encode(), subprocess.TimeoutExpired(['docker'], 120)]]
        for responses in cases:
            docker = module.Docker('/run/synthetic')
            docker.run = Mock(side_effect=responses)
            with self.assertRaises((module.GuardError, subprocess.TimeoutExpired)):
                docker.build()
            self.assertLessEqual(sum(call.args[0][0] == 'build' for call in docker.run.call_args_list), 1)

    def test_docker29_format_uses_optional_indexes_for_onbuild_and_labels(self):
        self.assertEqual(module.IMAGE_FORMAT, '{"id":{{json .Id}},"architecture":{{json .Architecture}},"os":{{json .Os}},"onbuild":{{json (index .Config "OnBuild")}},"labels":{{json (index .Config "Labels")}}}')
        docker = module.Docker('/run/synthetic')
        docker.run = Mock(return_value=json.dumps(image()).encode())
        docker.inspect(module.BASE)
        self.assertEqual(docker.run.call_args.args[0], ['image', 'inspect', module.BASE, '--format', module.IMAGE_FORMAT])

    def test_optional_null_or_empty_onbuild_and_null_base_labels_preserve_guards(self):
        docker = module.Docker('/run/synthetic')
        for onbuild in (None, []):
            docker.run = Mock(return_value=json.dumps(image(onbuild=onbuild, labels=None)).encode())
            self.assertEqual(docker.inspect(module.BASE), image(onbuild=onbuild, labels=None))
        for onbuild in (['RUN unsafe'], ['COPY public /app/public']):
            docker.run = Mock(return_value=json.dumps(image(onbuild=onbuild, labels=None)).encode())
            with self.assertRaises(module.GuardError):
                docker.inspect(module.BASE)
        docker.run = Mock(side_effect=[b'', json.dumps(image(labels=None)).encode(), b'public build', json.dumps(image()).encode()])
        self.assertEqual(docker.build(), IMAGE_ID)
        docker.run = Mock(side_effect=[b'', json.dumps(image(labels=None)).encode(), b'public build', json.dumps(image(labels=None)).encode()])
        with self.assertRaises(module.GuardError):
            docker.build()

    def test_version_probe_uses_image_id_and_cannot_run_wrapper_or_network(self):
        docker = module.Docker('/run/synthetic')
        docker.run = Mock(return_value=b'envoy  version: ' + b'a' * 40 + b'/1.39.1/Clean/RELEASE/BoringSSL\n')
        self.assertEqual(docker.probe(IMAGE_ID), '1.39.1')
        args = docker.run.call_args.args[0]
        for option in ('--network=none', '--log-driver=none', '--read-only', '--user=1000:1000', '--entrypoint=/app/envoy', '--no-healthcheck', '--cap-drop=ALL', '--security-opt=no-new-privileges'):
            self.assertIn(option, args)
        self.assertEqual(args[-2:], [IMAGE_ID, '--version'])
        for output in (b'1.39.1', b'envoy version: ' + b'a' * 40 + b'/1.39.0/Clean/RELEASE\n'):
            docker.run = Mock(return_value=output)
            with self.assertRaises(module.GuardError):
                docker.probe(IMAGE_ID)

    def test_version_probe_accepts_observed_fixed_entrypoint_but_rejects_other_paths(self):
        observed = b'\n/app/envoy  version: b579d07d3ad7ee11d32b105e91a5a39ad24718d7/1.39.1/Clean/RELEASE/BoringSSL\n\n'
        docker = module.Docker('/run/synthetic')
        docker.run = Mock(return_value=observed)
        self.assertEqual(docker.probe(IMAGE_ID), '1.39.1')
        for output in (observed.replace(b'/app/envoy', b'/tmp/envoy'), observed.replace(b'/app/envoy', b'/app/envoy-extra'), observed.replace(b'/1.39.1/', b'/1.39.0/')):
            docker.run = Mock(return_value=output)
            with self.assertRaises(module.GuardError):
                docker.probe(IMAGE_ID)

    def test_timeout_cleanup_needs_exact_cid_nonce_name_and_image(self):
        docker = module.Docker('/run/synthetic')
        info = SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_uid=0, st_nlink=1, st_size=64)
        exact = {'id': CID, 'name': '/doso-envoy-version-' + NONCE, 'nonce': NONCE, 'image': IMAGE_ID}
        for changes in ({'id': 'd' * 64}, {'name': '/unrelated'}, {'nonce': 'unrelated'}, {'image': 'sha256:' + 'e' * 64}, {}):
            docker.run = Mock(side_effect=[json.dumps(dict(exact, **changes)).encode(), b''])
            with patch.object(module.os, 'O_NOFOLLOW', 0x20000, create=True), patch.object(module.os, 'open', return_value=10), patch.object(module.os, 'fstat', return_value=info), patch.object(module.os, 'read', return_value=CID.encode()), patch.object(module.os, 'close'):
                if changes:
                    with self.assertRaises(module.GuardError):
                        docker.cleanup_probe('/run/synthetic/probe.cid', NONCE, IMAGE_ID)
                    self.assertEqual(docker.run.call_count, 1)
                else:
                    docker.cleanup_probe('/run/synthetic/probe.cid', NONCE, IMAGE_ID)
                    self.assertEqual(docker.run.call_args.args[0], ['container', 'rm', '-f', CID])

    def test_timed_out_probe_only_uses_its_own_cidfile_and_nonce(self):
        docker = module.Docker('/run/synthetic')
        docker.run = Mock(side_effect=subprocess.TimeoutExpired(['docker'], 20))
        docker.cleanup_probe = Mock()
        with patch.object(module.secrets, 'token_hex', return_value=NONCE):
            with self.assertRaises(module.GuardError):
                docker.probe(IMAGE_ID)
        docker.cleanup_probe.assert_called_once_with('/run/synthetic/probe.cid', NONCE, IMAGE_ID)

    def test_capacity_requires_memory_and_free_disk(self):
        disk = SimpleNamespace(f_bavail=6 * 1024 ** 3, f_frsize=1)
        for memory, available, succeeds in ((1600000, disk, True), (1000000, disk, False), (1600000, SimpleNamespace(f_bavail=4, f_frsize=1), False)):
            with patch('builtins.open', mock_open(read_data='MemAvailable: ' + str(memory) + ' kB\n')), patch.object(module.os, 'statvfs', return_value=available, create=True):
                if succeeds:
                    module.capacity()
                else:
                    with self.assertRaises(module.GuardError):
                        module.capacity()


if __name__ == '__main__':
    unittest.main()
