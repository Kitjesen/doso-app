#!/usr/bin/env python3
"""Package reviewed public sources once; this is not the upstream Envoy OCI image."""
import hashlib
import json
import os
from pathlib import PurePosixPath
import re
import secrets
import stat
import subprocess
import sys
import tempfile

ROOT = '/opt/doso-backend-shadow'
CANDIDATE = ROOT + '/envoy-candidate-20261027'
CONTEXT = CANDIDATE + '/context'
BINARY = '/home/admin/envoy-1.39.1-linux-x86_64'
BASE = 'public.ecr.aws/supabase/postgres-meta@sha256:822227a8d12c109b24b8d8f1dae98a9c089a698b4586d35527dadf929e655136'
TAG = 'doso-envoy-candidate:1.39.1-reviewed-20261027'
BINARY_HASH = '002c6e1c69ed0fa0ea381887247cadadfaec9481375fa8d8d2b1731eeabf40b8'
WRAPPER_HASH = 'fa95b1e7395af631f6baabfee764793e9c7b7fdd2e69ca9168ffae6443f6e711'
DOCKERFILE_HASH = '94bde6461174aa5ec9f48beb4150b5e4c6649075e440423ea0495d54e236fa4a'
LABELS = {'io.doso.envoy.binary.sha256': BINARY_HASH, 'io.doso.envoy.wrapper.sha256': WRAPPER_HASH, 'io.doso.envoy.dockerfile.sha256': DOCKERFILE_HASH}
PROBE_LABEL = 'io.doso.envoy.candidate-probe'
IMAGE_FORMAT = '{"id":{{json .Id}},"architecture":{{json .Architecture}},"os":{{json .Os}},"onbuild":{{json (index .Config "OnBuild")}},"labels":{{json (index .Config "Labels")}}}'
PROBE_FORMAT = '{"id":{{json .Id}},"name":{{json .Name}},"nonce":{{json (index .Config.Labels "io.doso.envoy.candidate-probe")}},"image":{{json .Image}}}'


class GuardError(Exception):
    pass


def require(condition):
    if not condition:
        raise GuardError('candidate_guard_failed')


def directory(path, root_owned=True):
    parts = PurePosixPath(path).parts
    require(parts and parts[0] == '/' and '..' not in parts)
    descriptor = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in ('', *parts[1:]):
            if part:
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
                os.close(descriptor)
                descriptor = child
            info = os.fstat(descriptor)
            require(stat.S_ISDIR(info.st_mode) and not info.st_mode & 0o022 and (not root_owned or info.st_uid == 0))
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def copy_verified(source, target, name, expected_hash, size, mode, root_owned=True):
    parent = directory(str(PurePosixPath(source).parent), root_owned)
    source_fd = destination = None
    try:
        source_fd = os.open(PurePosixPath(source).name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        before = os.fstat(source_fd)
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and not before.st_mode & 0o022 and (not root_owned or before.st_uid == 0) and before.st_size == size)
        destination = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=target)
        digest, copied = hashlib.sha256(), 0
        while True:
            chunk = os.read(source_fd, 1024 * 1024)
            if not chunk:
                break
            copied += len(chunk)
            require(copied <= size)
            digest.update(chunk)
            view = memoryview(chunk)
            while view:
                count = os.write(destination, view)
                require(count > 0)
                view = view[count:]
        after = os.fstat(source_fd)
        require(copied == size and digest.hexdigest() == expected_hash and (before.st_size, before.st_mtime_ns, before.st_ctime_ns) == (after.st_size, after.st_mtime_ns, after.st_ctime_ns))
        os.fchmod(destination, mode)
        os.fsync(destination)
        info = os.fstat(destination)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == mode and info.st_size == size)
    finally:
        for descriptor in (destination, source_fd, parent):
            if descriptor is not None:
                os.close(descriptor)


def public_size(path, expected_hash):
    parent = directory(str(PurePosixPath(path).parent))
    descriptor = None
    try:
        descriptor = os.open(PurePosixPath(path).name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        info = os.fstat(descriptor)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and not info.st_mode & 0o022 and 0 < info.st_size < 32768)
        content = os.read(descriptor, 32768)
        require(len(content) == info.st_size and hashlib.sha256(content).hexdigest() == expected_hash)
        return len(content)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        os.close(parent)


def capacity():
    with open('/proc/meminfo', encoding='ascii') as source:
        match = re.search(r'^MemAvailable:\s+(\d+) kB$', source.read(20000), re.MULTILINE)
    require(match and int(match[1]) * 1024 >= 1536 * 1024 ** 2)
    for path in (ROOT, '/var/lib/docker'):
        disk = os.statvfs(path)
        require(disk.f_bavail * disk.f_frsize >= 5 * 1024 ** 3)


def prepare_context(parent):
    os.mkdir(PurePosixPath(CANDIDATE).name, 0o700, dir_fd=parent)
    candidate = directory(CANDIDATE)
    try:
        os.mkdir('context', 0o700, dir_fd=candidate)
    finally:
        os.close(candidate)
    context = directory(CONTEXT)
    try:
        copy_verified(BINARY, context, 'envoy', BINARY_HASH, 105039832, 0o555, root_owned=False)
        for name, digest in (('envoy-safe-entrypoint.mjs', WRAPPER_HASH), ('Dockerfile.envoy-candidate', DOCKERFILE_HASH)):
            source = ROOT + '/tools/' + name
            copy_verified(source, context, 'Dockerfile' if name.startswith('Dockerfile') else name, digest, public_size(source, digest), 0o444)
        require(set(os.listdir(context)) == {'envoy', 'envoy-safe-entrypoint.mjs', 'Dockerfile'})
        os.fsync(context)
    finally:
        os.close(context)


class Docker:
    def __init__(self, private):
        self.private = private
        self.command = ['/usr/bin/docker', '--config', private, '--host', 'unix:///run/docker.sock']
        self.environment = {'PATH': '/usr/bin:/bin', 'HOME': private, 'DOCKER_CONFIG': private, 'DOCKER_BUILDKIT': '0', 'LANG': 'C', 'LC_ALL': 'C'}

    def run(self, args, timeout=15):
        result = subprocess.run(self.command + args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=self.environment, cwd=self.private, timeout=timeout, check=False)
        require(result.returncode == 0 and len(result.stdout) <= 2 * 1024 ** 2 and len(result.stderr) <= 2 * 1024 ** 2)
        return result.stdout

    def absent_tag(self):
        require(not self.run(['image', 'ls', '-q', '--no-trunc', '--filter', 'reference=' + TAG]).strip())

    def inspect(self, image):
        record = json.loads(self.run(['image', 'inspect', image, '--format', IMAGE_FORMAT]))
        require(re.fullmatch('sha256:[a-f0-9]{64}', record['id']) and record['architecture'] == 'amd64' and record['os'] == 'linux' and not record['onbuild'])
        return record

    def build(self):
        self.absent_tag()
        self.inspect(BASE)
        args = ['build', '--pull=false', '--network=none', '--memory=768m', '--memory-swap=768m', '--cpu-period=100000', '--cpu-quota=50000']
        for key, value in LABELS.items():
            args.extend(('--label', key + '=' + value))
        self.run(args + ['--tag', TAG, CONTEXT], timeout=120)
        record = self.inspect(TAG)
        require(all((record['labels'] or {}).get(key) == value for key, value in LABELS.items()))
        return record['id']

    def cleanup_probe(self, cidfile, nonce, image_id):
        descriptor = os.open(cidfile, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            info = os.fstat(descriptor)
            require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and info.st_size == 64)
            cid = os.read(descriptor, 65).decode('ascii')
        finally:
            os.close(descriptor)
        require(re.fullmatch('[a-f0-9]{64}', cid))
        record = json.loads(self.run(['container', 'inspect', cid, '--format', PROBE_FORMAT]))
        require(record == {'id': cid, 'name': '/doso-envoy-version-' + nonce, 'nonce': nonce, 'image': image_id})
        self.run(['container', 'rm', '-f', cid], timeout=10)

    def probe(self, image_id):
        nonce = secrets.token_hex(16)
        cidfile = self.private + '/probe.cid'
        args = ['run', '--pull=never', '--rm', '--name', 'doso-envoy-version-' + nonce, '--cidfile', cidfile, '--label', PROBE_LABEL + '=' + nonce, '--network=none', '--log-driver=none', '--read-only', '--no-healthcheck', '--user=1000:1000', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--ulimit=core=0:0', '--memory=128m', '--memory-swap=128m', '--cpus=0.5', '--pids-limit=32', '--entrypoint=/app/envoy', image_id, '--version']
        try:
            output = self.run(args, timeout=20)
        except (subprocess.TimeoutExpired, KeyboardInterrupt):
            self.cleanup_probe(cidfile, nonce, image_id)
            raise GuardError('probe_interrupted') from None
        # Envoy includes argv[0], which is /app/envoy for this fixed entrypoint.
        require(len(output) < 4096 and re.fullmatch(rb'\s*(?:/app/)?envoy\s+version:\s+[a-f0-9]{40}/1\.39\.1/[^\r\n]+\s*', output))
        return '1.39.1'


def main(argv=None):
    stage, parent, image_id, version = 'preflight', None, None, None
    try:
        require(not (sys.argv[1:] if argv is None else argv) and sys.platform == 'linux' and os.geteuid() == 0)
        import fcntl
        import resource
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        os.umask(0o077)
        parent = directory(ROOT)
        fcntl.flock(parent, fcntl.LOCK_EX | fcntl.LOCK_NB)
        runtime = directory('/run')
        os.close(runtime)
        socket = os.lstat('/run/docker.sock')
        require(stat.S_ISSOCK(socket.st_mode) and socket.st_uid == 0 and not socket.st_mode & 0o002)
        capacity()
        with tempfile.TemporaryDirectory(prefix='doso-envoy-', dir='/run') as private:
            os.chmod(private, 0o700)
            with open(private + '/config.json', 'xb') as config:
                config.write(b'{}\n')
            docker = Docker(private)
            docker.absent_tag()
            docker.inspect(BASE)
            stage = 'context'
            prepare_context(parent)
            capacity()
            stage = 'build'
            image_id = docker.build()
            stage = 'version'
            version = docker.probe(image_id)
        stage = 'complete'
    except BaseException:
        pass
    finally:
        if parent is not None:
            os.close(parent)
    success = stage == 'complete'
    print(json.dumps({'stage': stage, 'ok': success, 'version': version, 'image_id': image_id, 'source_hashes': {'binary': BINARY_HASH, 'wrapper': WRAPPER_HASH, 'dockerfile': DOCKERFILE_HASH}, 'candidate_may_exist': stage in ('build', 'version', 'complete'), 'credentials_printed': False}))
    return 0 if success else 1


if __name__ == '__main__':
    raise SystemExit(main())
