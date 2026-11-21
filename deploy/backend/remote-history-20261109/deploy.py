"""Apply history SQL, then append layer 16 using the reviewed release bases."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import sys
import tempfile
from urllib.parse import urlsplit

ROOT = Path('/opt/doso-backend-shadow')
WORK = ROOT / 'runtime-20261027/docker'
HERE = WORK / 'doso/remote-history-20261109'
PREVIOUS = WORK / 'doso/device-location-20261108'
GATEWAY = WORK / 'doso/video-access-20261106'
ENV = ROOT / 'env/.env'
PRIVATE_ENV = ROOT / 'env/remote-history.env'
LAYER = 'doso/remote-history-20261109/compose.remote-history.yml'
OLD_FUNCTIONS = b'account-sessions|device-binding|remote-state|remote-state-sync|admin-devices|video-access|video-authorize'
NEW_FUNCTIONS = OLD_FUNCTIONS + b'|remote-history|telemetry-export'


def require(condition, reason):
    if not condition:
        raise RuntimeError(reason)


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def hashes(directory):
    require(not any(path.is_symlink() for path in directory.rglob('*')), 'snapshot_symlink')
    return {path.relative_to(directory).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in directory.rglob('*') if path.is_file()}


def private_values(content):
    values = {}
    for line in content.splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        key, separator, value = line.partition('=')
        require(separator and key in ('DOSO_THINGSBOARD_URL', 'DOSO_THINGSBOARD_KEY', 'SUPABASE_SECRET_KEYS')
                and key not in values, 'invalid_private_environment')
        if value.startswith("'") and value.endswith("'"):
            value = value[1:-1].replace("\\'", "'")
        require(value and not any(ord(char) < 32 for char in value), 'invalid_private_environment')
        values[key] = value
    require('DOSO_THINGSBOARD_URL' in values and 'DOSO_THINGSBOARD_KEY' in values, 'missing_platform_configuration')
    url = urlsplit(values['DOSO_THINGSBOARD_URL'])
    require(url.scheme == 'https' or url.scheme == 'http' and url.hostname in ('localhost', '127.0.0.1', '::1'),
            'unsafe_platform_url')
    require(url.hostname and not url.username and not url.password and not url.query and not url.fragment
            and url.path in ('', '/'), 'unsafe_platform_url')
    return values


def merged_environment(existing, content):
    values = private_values(content)
    keys = json.loads(existing)
    supplied = json.loads(values.get('SUPABASE_SECRET_KEYS', '{}'))
    require(isinstance(keys, dict) and isinstance(supplied, dict)
            and all(isinstance(key, str) and isinstance(value, str) and value for key, value in keys.items()),
            'invalid_named_key_environment')
    require(all(key == 'telemetry-export' or keys.get(key) == value for key, value in supplied.items()),
            'existing_named_key_changed')
    keys = dict(keys, **supplied)
    key = keys.setdefault('telemetry-export', 'sb_secret_' + secrets.token_urlsafe(32))
    require(isinstance(key, str) and key.startswith('sb_secret_') and len(key) >= 40
            and all(key != value for name, value in keys.items() if name != 'telemetry-export'), 'invalid_export_key')
    values['SUPABASE_SECRET_KEYS'] = json.dumps(keys, separators=(',', ':')).replace("'", '\\u0027')
    encoded = ''.join(name + "='" + value.replace("'", "\\'") + "'\n" for name, value in values.items())
    return encoded.encode('utf8'), values


def write_private(content):
    with tempfile.NamedTemporaryFile(dir=PRIVATE_ENV.parent, prefix='.remote-history-', delete=False) as output:
        temporary = Path(output.name)
        try:
            os.chmod(temporary, 0o600)
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
            os.replace(temporary, PRIVATE_ENV)
        finally:
            temporary.unlink(missing_ok=True)


def verify_active_layers(records, layers):
    for name, expected in (('functions', layers), ('api-gw', layers[:13])):
        labels = records[name]['Config']['Labels']
        require(labels.get('com.docker.compose.project.working_dir') == str(WORK)
                and labels.get('com.docker.compose.project.config_files', '').split(',') == [str(WORK / item) for item in expected],
                'expected_active_fifteen_functions_thirteen_gateway_layers')


def verify_change(before, after, values):
    expected = copy.deepcopy(before)
    for name, previous in (('functions', PREVIOUS), ('api-gw', GATEWAY)):
        for mount in expected['services'][name]['volumes']:
            source = mount.get('source', '')
            if mount.get('type') == 'bind' and source.startswith(str(previous) + '/'):
                mount['source'] = str(HERE) + source[len(str(previous)):]
    environment = expected['services']['functions']['environment']
    environment.update(values)
    environment['DOSO_TELEMETRY_EXPORT_SECRET_NAME'] = 'telemetry-export'
    require(after == expected, 'unexpected_effective_compose_change')
    keys = json.loads(values['SUPABASE_SECRET_KEYS'])
    require(keys['telemetry-export'] not in {environment['SUPABASE_ANON_KEY'], environment['SUPABASE_SERVICE_ROLE_KEY']},
            'export_key_reuses_api_key')


def main():
    operation = sys.argv[1] if len(sys.argv) == 2 else None
    descriptors = ()
    backup = None
    stage = 'preflight'
    try:
        require(sys.platform == 'linux' and os.geteuid() == 0 and operation in ('database', 'runtime'), 'linux_root_database_or_runtime_required')
        require(Path(__file__).resolve() == HERE / 'deploy.py', 'install_in_release_directory')
        os.umask(0o077)
        import resource
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        core = module('history_core', ROOT / 'tools/otp-six-20261027/start-shadow-core.py')
        base = module('history_runtime', HERE / 'runtime_base.py')
        database = module('history_database', HERE / 'database_base.py')
        gateway = module('history_gateway', HERE / 'gateway_base.py')
        gateway.HERE, gateway.OLD_FUNCTIONS, gateway.NEW_FUNCTIONS = HERE, OLD_FUNCTIONS, NEW_FUNCTIONS
        gateway.POSTFLIGHT_MARKER = b'PASS remote_history_readonly_postflight'
        layers = base.LAYERS + ('doso/device-cloud-20261103/compose.device-cloud.yml',
            'doso/device-admin-20261104/compose.device-admin.yml', 'doso/video-access-20261106/compose.video-access.yml',
            'doso/simulated-device-20261107/compose.simulated-device.yml', 'doso/device-location-20261108/compose.device-location.yml')
        descriptors = core.lock_environment()
        original_env = ENV.read_bytes()
        baseline = json.loads((HERE / 'baseline.json').read_text())['functions']
        require(hashes(PREVIOUS / 'functions') == baseline, 'active_function_snapshot_changed')
        packaged = hashes(HERE / 'functions')
        require(all(packaged.get(path) == digest for path, digest in baseline.items())
                and set(packaged) - set(baseline) == {'remote-history/index.ts', 'remote-history/handler.ts',
                    'telemetry-export/index.ts', 'telemetry-export/handler.ts'}, 'unexpected_function_changes')
        with tempfile.TemporaryDirectory(prefix='doso-remote-history-', dir='/run') as private:
            docker = core.Docker(private)
            docker.compose = ['compose', '--project-name', 'doso-backend-shadow', '--project-directory', str(WORK), '--env-file', str(ENV)]
            for layer in layers:
                docker.compose.extend(['-f', str(WORK / layer)])
            before = base.snapshot(docker)
            verify_active_layers(before, layers)
            before_model = json.loads(docker.run(docker.compose + ['config', '--format', 'json']))
            base.verify_actual_services(before_model, before)
            backup = Path(tempfile.mkdtemp(prefix='remote-history-' + operation + '-', dir=ROOT / 'env'))
            (backup / '.env').write_bytes(original_env)
            (backup / 'containers-before.json').write_text(json.dumps(before))
            (backup / 'compose-before.json').write_text(json.dumps(before_model))
            (backup / 'layers.json').write_text(json.dumps(layers))
            for index, layer in enumerate(layers):
                (backup / f'layer-{index + 1:02d}.yml').write_bytes((WORK / layer).read_bytes())
            if operation == 'database':
                stage = 'database'
                database.release(docker, HERE / 'sql', backup, commit_marker=b'PASS remote_history_transaction_committed')
                gateway.postflight(docker)
            else:
                stage = 'runtime_preflight'
                gateway.postflight(docker)
                require(PRIVATE_ENV.is_file() and not PRIVATE_ENV.is_symlink()
                        and PRIVATE_ENV.stat().st_uid == 0 and PRIVATE_ENV.stat().st_mode & 0o077 == 0, 'private_environment_requires_root_0600')
                private_before = PRIVATE_ENV.read_bytes()
                updated, values = merged_environment(before_model['services']['functions']['environment']['SUPABASE_SECRET_KEYS'], private_before.decode('utf8'))
                require(gateway.SITE.is_file() and not gateway.SITE.is_symlink() and gateway.ENABLED_SITE.is_symlink()
                        and gateway.ENABLED_SITE.resolve() == gateway.SITE, 'expected_active_api_site')
                original_site = gateway.SITE.read_bytes()
                gateway.nginx_candidate(original_site, (HERE / 'https.conf').read_bytes())
                gateway.system_command(['/usr/sbin/nginx', '-t'])
                (backup / 'nginx-api.conf').write_bytes(original_site)
                (backup / 'remote-history.env').write_bytes(private_before)
                write_private(updated)
                after_compose = docker.compose + ['-f', str(WORK / LAYER)]
                try:
                    after_model = json.loads(docker.run(after_compose + ['config', '--format', 'json']))
                    verify_change(before_model, after_model, values)
                    stage = 'envoy_validation'
                    result = json.loads(docker.run(after_compose + ['run', '--rm', '--no-deps', '--pull', 'never', '--entrypoint', 'node',
                        'api-gw', '/app/validate-config.mjs'], timeout=45))
                    require(result.get('status') == 'gateway_bootstrap_validated', 'envoy_validation_failed')
                    require(base.core_identity(base.snapshot(docker)) == base.core_identity(before), 'core_changed_during_preflight')
                    for name in ('functions', 'api-gw'):
                        stage = name + '_update'
                        docker.run(after_compose + ['up', '--detach', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '60', name], timeout=90)
                    stage = 'runtime_postcheck'
                    after = base.snapshot(docker)
                    base.verify_actual_services(after_model, after)
                    require(base.core_identity(after) == base.core_identity(before), 'core_service_identity_changed')
                    require(gateway.SITE.read_bytes() == original_site, 'api_site_changed_during_release')
                    gateway.install_nginx(original_site, (HERE / 'https.conf').read_bytes())
                    gateway.postflight(docker)
                    require(ENV.read_bytes() == original_env, 'main_environment_changed')
                except BaseException:
                    write_private(private_before)
                    if gateway.SITE.read_bytes() != original_site:
                        gateway.write_site(original_site)
                        gateway.system_command(['/usr/sbin/nginx', '-t'])
                        gateway.system_command(['/bin/systemctl', 'reload', 'nginx'])
                    docker.run(docker.compose + ['up', '--detach', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '60', 'functions'], timeout=90)
                    docker.run(docker.compose[:-4] + ['up', '--detach', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '60', 'api-gw'], timeout=90)
                    raise
            require(ENV.read_bytes() == original_env, 'main_environment_changed')
            require(base.core_identity(base.snapshot(docker)) == base.core_identity(before), 'core_service_identity_changed')
            report = {'status': 'remote_history_' + operation + '_ready', 'backup': str(backup), 'main_environment_preserved': True,
                'core_services_preserved': True, 'https_verified': False, 'relay_verified': False}
            (HERE / ('deployment-' + operation + '.json')).write_text(json.dumps(report, indent=2))
            print(json.dumps(report))
        return 0
    except BaseException as error:
        print(json.dumps({'status': 'remote_history_release_failed', 'stage': stage, 'operation': operation,
            'reason': str(error) if isinstance(error, RuntimeError) else type(error).__name__,
            'backup': str(backup) if backup else None, 'secrets_printed': False}))
        return 1
    finally:
        for descriptor in reversed(descriptors):
            os.close(descriptor)


if __name__ == '__main__':
    raise SystemExit(main())
