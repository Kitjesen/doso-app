#!/usr/bin/env python3
"""One-shot guard for starting only the new shadow DB, Auth, REST and mail service."""
import hashlib
import http.client
import json
import os
from pathlib import PurePosixPath
import re
import secrets
import signal
import smtplib
import ssl
import stat
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit

ROOT = '/opt/doso-backend-shadow/runtime-20261027'
WORK = ROOT + '/docker'
ENV = '/opt/doso-backend-shadow/env/.env'
PROJECT = 'doso-backend-shadow'
NETWORK = PROJECT + '_default'
LAYERS = ('docker-compose.yml', 'docker-compose.caddy.yml', 'doso/compose.doso.yml', 'doso/compose.host-nginx.yml', 'doso/compose.images-amd64.yml', 'doso/compose.mail-templates.yml')
SELECTED = frozenset(('db', 'auth', 'rest', 'mail-templates'))
META = 'public.ecr.aws/supabase/postgres-meta@sha256:822227a8d12c109b24b8d8f1dae98a9c089a698b4586d35527dadf929e655136'
IMAGES = {
    'db': 'ghcr.io/supabase/postgres@sha256:5a4314708484bec672de2c09653a5c01fb1c84a998564ac231b0325e2238ed5b',
    'auth': 'ghcr.io/supabase/gotrue@sha256:839f529492d116b4e8b7777c953a27c381d34c15a744b1bcefde5eefaa1f9f9f',
    'rest': 'public.ecr.aws/supabase/postgrest@sha256:c847127074bd26e1b8d3f7c0e6e01e5346f4b85dd34f5d699fd230af960827c0',
    'mail-templates': META,
}
NAMES = {'db': 'supabase-db', 'auth': 'supabase-auth', 'rest': 'supabase-rest', 'mail-templates': PROJECT + '-mail-templates-1'}
MANIFEST_HASH = '97b54c12b7227c4e60210220604094e076ea6286f0196f372ea3ec97ef6eb5b5'
MAIL_HASH = 'd0c36d7f0f3dde994a407754938edd6ff4028dad1967b3724cf053b8bd422fe1'
INSPECT = '{"id":{{json .Id}},"name":{{json .Name}},"labels":{{json .Config.Labels}},"image":{{json .Config.Image}},"running":{{json .State.Running}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}}'
PROBE = ("""import {createHash} from 'node:crypto';
try {
  const auth = await fetch('http://auth:9999/health', {redirect:'error', signal:AbortSignal.timeout(5000)});
  const authReady = auth.status === 200;
  await auth.body?.cancel();
  const mail = await fetch('http://mail-templates:8080/confirmation.html', {redirect:'error', signal:AbortSignal.timeout(5000)});
  let size = 0; const hash = createHash('sha256');
  for await (const chunk of mail.body) { size += chunk.length; if(size > 65536) throw new Error(); hash.update(chunk); }
  const confirmation = mail.status === 200 && hash.digest('hex') === '__MAIL_HASH__';
  process.stdout.write(JSON.stringify({auth:authReady, confirmation}));
  process.exitCode = authReady && confirmation ? 0 : 1;
} catch { process.stdout.write('{"auth":false,"confirmation":false}'); process.exitCode=1; }
""").replace('__MAIL_HASH__', MAIL_HASH).encode('utf-8')


class GuardError(Exception):
    pass


def require(condition, reason):
    if not condition:
        raise GuardError(reason)


def open_directory(path, mode=None):
    parts = PurePosixPath(path).parts
    require(parts and parts[0] == '/' and '..' not in parts, 'unsafe_path')
    descriptor = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for component in ('', *parts[1:]):
            if component:
                child = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
                os.close(descriptor)
                descriptor = child
            info = os.fstat(descriptor)
            require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022, 'unsafe_directory')
        require(mode is None or stat.S_IMODE(info.st_mode) == mode, 'private_directory_required')
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def read_public(path, limit):
    parent = open_directory(str(PurePosixPath(path).parent))
    descriptor = None
    try:
        descriptor = os.open(PurePosixPath(path).name, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW, dir_fd=parent)
        info = os.fstat(descriptor)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and not info.st_mode & 0o022 and info.st_size <= limit, 'unsafe_public_file')
        with os.fdopen(descriptor, 'rb', closefd=False) as source:
            content = source.read(limit + 1)
        require(len(content) <= limit, 'public_file_too_large')
        return content
    finally:
        if descriptor is not None:
            os.close(descriptor)
        os.close(parent)


def validate_runtime():
    manifest = read_public(ROOT + '/runtime-manifest.json', 30000)
    require(hashlib.sha256(manifest).hexdigest() == MANIFEST_HASH, 'runtime_manifest_mismatch')
    records = json.loads(manifest)['files']
    require(len(records) == 37, 'runtime_file_count_mismatch')
    for name, record in records.items():
        parts = PurePosixPath(name)
        require(not parts.is_absolute() and '..' not in parts.parts and '\\' not in name and parts.name != '.env', 'unsafe_runtime_record')
        content = read_public(ROOT + '/' + name, 2 * 1024 * 1024)
        require(len(content) == record['size'] and hashlib.sha256(content).hexdigest() == record['sha256'], 'runtime_file_mismatch')


def lock_environment():
    import fcntl
    directory = open_directory('/opt/doso-backend-shadow/env', 0o700)
    descriptor = None
    try:
        fcntl.flock(directory, fcntl.LOCK_EX | fcntl.LOCK_NB)
        descriptor = os.open('.env', os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW, dir_fd=directory)
        info = os.fstat(descriptor)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600 and 0 < info.st_size <= 65536, 'private_environment_required')
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return directory, descriptor
    except BaseException:
        if descriptor is not None:
            os.close(descriptor)
        os.close(directory)
        raise


def prepare_data():
    parent = open_directory(WORK + '/volumes/db')
    descriptor = None
    try:
        try:
            os.mkdir('data', 0o700, dir_fd=parent)
        except FileExistsError:
            pass
        descriptor = os.open('data', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
        info = os.fstat(descriptor)
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o700 and not os.listdir(descriptor), 'new_empty_data_directory_required')
    finally:
        if descriptor is not None:
            os.close(descriptor)
        os.close(parent)


def check_capacity():
    with open('/proc/meminfo', encoding='ascii') as source:
        match = re.search(r'^MemAvailable:\s+(\d+) kB$', source.read(20000), re.MULTILINE)
    require(match and int(match[1]) * 1024 >= 1536 * 1024 * 1024, 'insufficient_available_memory')
    disk = os.statvfs(ROOT)
    require(disk.f_bavail * disk.f_frsize >= 5 * 1024 ** 3, 'insufficient_free_disk')


def website_snapshot():
    result = subprocess.run(['/usr/sbin/nginx', '-T'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15, env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C', 'LC_ALL': 'C'}, stdin=subprocess.DEVNULL, check=False)
    require(result.returncode == 0 and len(result.stdout) <= 2 * 1024 * 1024, 'nginx_snapshot_failed')
    nginx_hash = hashlib.sha256(result.stdout).hexdigest()
    def expired(_signal, _frame):
        raise GuardError('website_probe_timed_out')
    previous = signal.signal(signal.SIGALRM, expired)
    connection = http.client.HTTPConnection('127.0.0.1', 80, timeout=5)
    try:
        signal.alarm(15)
        connection.request('GET', '/', headers={'Host': 'inovxio.com', 'Accept-Encoding': 'identity', 'Connection': 'close'})
        response = connection.getresponse()
        require(response.status == 200, 'website_http_200_required')
        body = response.read(2 * 1024 * 1024 + 1)
        require(len(body) <= 2 * 1024 * 1024, 'website_response_too_large')
        return {'nginx': nginx_hash, 'http': hashlib.sha256(body).hexdigest()}
    finally:
        connection.close()
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous)


def validate_model(model):
    require(model.get('name') == PROJECT, 'wrong_project')
    services = model['services']
    for name, image in dict(IMAGES, meta=META).items():
        require(services[name]['image'] == image, 'image_identity_mismatch')
    published = [(name, port) for name, service in services.items() for port in service.get('ports', [])]
    require(len(published) == 1, 'unexpected_published_ports')
    name, port = published[0]
    require(name == 'api-gw' and port.get('host_ip') == '127.0.0.1' and str(port.get('published')) == '18000' and port.get('target') == 8000 and port.get('protocol') == 'tcp', 'unexpected_published_ports')
    require(model['networks']['default'].get('name') == NETWORK and not model['networks']['default'].get('external'), 'wrong_project_network')
    require(model['volumes']['db-config'].get('name') == PROJECT + '_db-config' and not model['volumes']['db-config'].get('external'), 'wrong_database_volume')
    dependencies = {'db': set(), 'auth': {'db', 'mail-templates'}, 'rest': {'db'}, 'mail-templates': set()}
    for name in SELECTED:
        service = services[name]
        require(not service.get('ports') and not service.get('network_mode') and not service.get('privileged') and not service.get('build'), 'unsafe_selected_service')
        require(set(service.get('depends_on', {})) == dependencies[name] and set(service.get('networks', {})) == {'default'}, 'unexpected_service_dependencies')
        require(service.get('container_name', PROJECT + '-' + name + '-1') == NAMES[name], 'unexpected_container_name')
        for volume in service.get('volumes', []):
            if volume['type'] == 'bind':
                require(volume['source'].startswith(WORK + '/') and '..' not in PurePosixPath(volume['source']).parts, 'unsafe_bind_source')
            else:
                require(name == 'db' and volume['type'] == 'volume' and volume['source'] == 'db-config' and volume['target'] == '/etc/postgresql-custom', 'unsafe_selected_volume')
    data = [volume for volume in services['db']['volumes'] if volume['target'] == '/var/lib/postgresql/data']
    require(len(data) == 1 and data[0]['type'] == 'bind' and data[0]['source'] == WORK + '/volumes/db/data', 'wrong_database_data_path')
    require(services['rest']['healthcheck']['test'] == ['CMD', 'postgrest', '--ready'], 'unexpected_rest_healthcheck')
    require(services['auth']['environment'].get('GOTRUE_MAILER_TEMPLATES_CONFIRMATION') == 'http://mail-templates:8080/confirmation.html', 'wrong_confirmation_template')
    database = services['db']['environment']
    require(database.get('POSTGRES_DB') == 'postgres' and database.get('POSTGRES_PORT') == '5432' and database.get('POSTGRES_PASSWORD'), 'unexpected_database_environment')
    for name, key, username in (('auth', 'GOTRUE_DB_DATABASE_URL', 'supabase_auth_admin'), ('rest', 'PGRST_DB_URI', 'authenticator')):
        uri = urlsplit(services[name]['environment'][key])
        require(uri.scheme == 'postgres' and uri.hostname == 'db' and uri.port == 5432 and uri.path == '/postgres' and uri.username == username and uri.password == database['POSTGRES_PASSWORD'] and not uri.query and not uri.fragment, 'external_database_forbidden')


def smtp_authenticate(auth, interpolation):
    expected = {'GOTRUE_SMTP_HOST': 'smtpdm.aliyun.com', 'GOTRUE_SMTP_PORT': '465', 'GOTRUE_SMTP_USER': 'no-reply@auth.dosorobotics.com', 'GOTRUE_SMTP_ADMIN_EMAIL': 'no-reply@auth.dosorobotics.com', 'GOTRUE_SMTP_SENDER_NAME': 'DOSO'}
    require(all(auth.get(key) == value for key, value in expected.items()), 'smtp_configuration_mismatch')
    encoded = auth.get('GOTRUE_SMTP_PASS')
    require(isinstance(encoded, str) and '$' not in encoded.replace('$$', ''), 'smtp_serialization_mismatch')
    password = encoded.replace('$$', '$')
    raw = [line[len('SMTP_PASS='):] for line in interpolation.decode('utf-8').splitlines() if line.startswith('SMTP_PASS=')]
    require(raw == [password], 'smtp_serialization_mismatch')
    require(0 < len(password) <= 4096 and all(32 <= ord(char) <= 126 for char in password), 'invalid_smtp_password')
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    try:
        with smtplib.SMTP_SSL('smtpdm.aliyun.com', 465, timeout=15, context=context) as smtp:
            smtp.login('no-reply@auth.dosorobotics.com', password)
    except ssl.SSLCertVerificationError:
        raise GuardError('smtp_tls_verification_failed') from None
    except smtplib.SMTPAuthenticationError:
        raise GuardError('smtp_authentication_failed') from None
    except TimeoutError:
        raise GuardError('smtp_timeout') from None
    except (OSError, smtplib.SMTPException):
        raise GuardError('smtp_connection_failed') from None


class Docker:
    def __init__(self, private):
        self.private = private
        self.environment = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': private, 'DOCKER_CONFIG': private, 'LANG': 'C', 'LC_ALL': 'C'}
        self.command = ['/usr/bin/docker', '--config', private, '--host', 'unix:///var/run/docker.sock']
        self.compose = ['compose', '--project-name', PROJECT, '--project-directory', WORK, '--env-file', ENV]
        for layer in LAYERS:
            self.compose.extend(('-f', WORK + '/' + layer))

    def run(self, args, timeout=20, data=None):
        options = {'capture_output': True, 'timeout': timeout, 'env': self.environment, 'cwd': WORK, 'check': False}
        options['stdin' if data is None else 'input'] = subprocess.DEVNULL if data is None else data
        result = subprocess.run(self.command + args, **options)
        require(result.returncode == 0 and len(result.stdout) <= 2 * 1024 * 1024, 'docker_command_failed')
        return result.stdout

    def preflight(self):
        require(not self.run(['container', 'ls', '-aq', '--filter', 'label=com.docker.compose.project=' + PROJECT]).strip(), 'existing_project_containers')
        names = self.run(['container', 'ls', '-a', '--format', '{{.Names}}']).decode().splitlines()
        require(not set(names) & set(NAMES.values()) and not any(name.startswith((PROJECT + '-', PROJECT + '_')) for name in names), 'existing_selected_container')
        for kind in ('network', 'volume'):
            require(not self.run([kind, 'ls', '-q', '--filter', 'label=com.docker.compose.project=' + PROJECT]).strip(), 'existing_project_resources')
            existing = self.run([kind, 'ls', '--format', '{{.Name}}']).decode().splitlines()
            require(not any(name == PROJECT or name.startswith((PROJECT + '-', PROJECT + '_')) for name in existing), 'existing_project_resources')
        for image in set(IMAGES.values()):
            identity = json.loads(self.run(['image', 'inspect', image, '--format', '{"architecture":{{json .Architecture}},"os":{{json .Os}}}']))
            require(identity == {'architecture': 'amd64', 'os': 'linux'}, 'cached_image_platform_mismatch')

    def verify_started(self):
        ids = self.run(['container', 'ls', '-aq', '--filter', 'label=com.docker.compose.project=' + PROJECT]).decode().splitlines()
        require(len(ids) == 4 and all(re.fullmatch('[0-9a-f]{12,64}', value) for value in ids), 'unexpected_started_containers')
        found = {}
        for cid in ids:
            record = json.loads(self.run(['container', 'inspect', cid, '--format', INSPECT]))
            labels = record.get('labels') or {}
            name = labels.get('com.docker.compose.service')
            require(name in SELECTED and name not in found and labels.get('com.docker.compose.project') == PROJECT and record['name'] == '/' + NAMES[name] and record['image'] == IMAGES[name] and record['running'] is True and record['health'] == 'healthy' and re.fullmatch('[0-9a-f]{64}', record['id']), 'started_container_identity_mismatch')
            found[name] = record['id']
        require(set(found) == SELECTED, 'unexpected_started_containers')
        return found

    def probe(self, rest_cid):
        self.run(['exec', rest_cid, 'postgrest', '--ready'])
        nonce = secrets.token_hex(8)
        name = 'doso-shadow-core-probe-' + nonce
        cidfile = self.private + '/probe.cid'
        command = ['run', '--pull', 'never', '--rm', '-i', '--name', name, '--cidfile', cidfile, '--label', 'com.docker.compose.project=' + PROJECT, '--label', 'com.docker.compose.service=core-probe', '--label', 'io.doso.shadow-core-probe=' + nonce, '--network', NETWORK, '--log-driver', 'none', '--read-only', '--no-healthcheck', '--user', '65532:65532', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--ulimit', 'core=0:0', '--memory', '128m', '--memory-swap', '128m', '--cpus', '0.5', '--pids-limit', '32', '--entrypoint', 'node', META, '--input-type=module', '-']
        try:
            result = self.run(command, timeout=20, data=PROBE)
        except (subprocess.TimeoutExpired, KeyboardInterrupt):
            try:
                cid = read_public(cidfile, 64).decode('ascii')
                require(re.fullmatch('[0-9a-f]{64}', cid), 'probe_cleanup_unconfirmed')
                record = json.loads(self.run(['container', 'inspect', cid, '--format', INSPECT]))
                require(record['id'] == cid and record['name'] == '/' + name and record['labels'].get('io.doso.shadow-core-probe') == nonce and record['labels'].get('com.docker.compose.project') == PROJECT and record['labels'].get('com.docker.compose.service') == 'core-probe', 'probe_cleanup_unconfirmed')
                self.run(['container', 'rm', '-f', cid], timeout=10)
            except Exception:
                raise GuardError('probe_cleanup_unconfirmed') from None
            raise GuardError('probe_interrupted_or_timed_out') from None
        require(json.loads(result) == {'auth': True, 'confirmation': True}, 'internal_probe_failed')


def main(argv=None):
    stage = 'preflight'
    descriptors = ()
    try:
        require(not (sys.argv[1:] if argv is None else argv), 'arguments_not_allowed')
        require(sys.platform == 'linux' and os.geteuid() == 0, 'linux_root_required')
        import resource
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        os.umask(0o077)
        descriptors = lock_environment()
        validate_runtime()
        check_capacity()
        prepare_data()
        with tempfile.TemporaryDirectory(prefix='doso-core-', dir='/run') as private:
            os.chmod(private, 0o700)
            require(not os.listdir(private), 'private_docker_config_not_empty')
            docker = Docker(private)
            model = json.loads(docker.run(docker.compose + ['config', '--format', 'json']))
            validate_model(model)
            docker.preflight()
            stage = 'smtp_preflight'
            interpolation = docker.run(docker.compose + ['config', '--environment'])
            smtp_authenticate(model['services']['auth']['environment'], interpolation)
            check_capacity()
            stage = 'website_before'
            website_before = website_snapshot()
            stage = 'db_start'
            print('{"status":"starting_shadow_db"}', flush=True)
            docker.run(docker.compose + ['up', '--wait', '--wait-timeout', '120', '--pull', 'never', 'db'], timeout=150)
            stage = 'auth_rest_start'
            print('{"status":"starting_shadow_auth_rest_mail"}', flush=True)
            docker.run(docker.compose + ['up', '--wait', '--wait-timeout', '120', '--pull', 'never', 'auth', 'rest'], timeout=150)
            stage = 'probe'
            found = docker.verify_started()
            docker.probe(found['rest'])
            stage = 'website_after'
            website_after = website_snapshot()
            require(website_after == website_before, 'existing_website_changed')
        print(json.dumps({'status': 'shadow_core_ready', 'smtp_authenticated': True, 'db_ready': True, 'auth_ready': True, 'rest_ready': True, 'confirmation_hash_verified': True, 'website_preserved': True, 'nginx_config_sha256': website_after['nginx'], 'website_body_sha256': website_after['http'], 'credentials_printed': False}))
        return 0
    except GuardError as error:
        reason = str(error)
    except subprocess.TimeoutExpired:
        reason = 'docker_command_timed_out'
    except (KeyboardInterrupt, EOFError):
        reason = 'interrupted'
    except BaseException:
        reason = 'shadow_core_failed'
    finally:
        for descriptor in reversed(descriptors):
            os.close(descriptor)
    print(json.dumps({'status': 'failed', 'stage': stage, 'reason': reason, 'services_may_be_running': stage in ('db_start', 'auth_rest_start', 'probe', 'website_after'), 'website_preserved': False, 'credentials_printed': False}))
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
