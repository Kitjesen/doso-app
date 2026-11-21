#!/usr/bin/env python3
"""Apply device-admin SQL, then append its runtime layer to the eleven-layer stack."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path('/opt/doso-backend-shadow')
WORK = ROOT / 'runtime-20261027/docker'
ENV = ROOT / 'env/.env'
HERE = WORK / 'doso/device-admin-20261104'
SITE = Path('/etc/nginx/sites-available/doso-api')
ENABLED_SITE = Path('/etc/nginx/sites-enabled/doso-api')
BASE_RELEASE = WORK / 'doso/device-cloud-20261103'
LAYER = 'doso/device-admin-20261104/compose.device-admin.yml'
OLD_FUNCTIONS = b'account-sessions|device-binding|remote-state|remote-state-sync'
NEW_FUNCTIONS = OLD_FUNCTIONS + b'|admin-devices'
COMMIT_MARKER = b'PASS device_admin_transaction_committed'
POSTFLIGHT_MARKER = b'PASS device_admin_readonly_postflight'


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def verify_active_layers(records, layers):
    expected = [str(WORK / layer) for layer in layers]
    for name in ('api-gw', 'functions'):
        labels = records[name]['Config']['Labels']
        require(labels.get('com.docker.compose.project.working_dir') == str(WORK),
                'unexpected_compose_working_directory')
        actual = labels.get('com.docker.compose.project.config_files', '').split(',')
        require(actual == expected, 'expected_active_eleven_layers')
        require(any(mount.get('Source', '').startswith(str(BASE_RELEASE) + '/')
                    for mount in records[name]['Mounts']), 'expected_device_cloud_mounts')


def verify_change(before, after):
    expected = copy.deepcopy(before)
    for name in ('api-gw', 'functions'):
        for mount in expected['services'][name]['volumes']:
            source = mount.get('source', '')
            if mount.get('type') == 'bind' and source.startswith(str(BASE_RELEASE) + '/'):
                mount['source'] = str(HERE) + source[len(str(BASE_RELEASE)):]
    require(after == expected, 'unexpected_effective_compose_change')


def nginx_candidate(original, candidate):
    marker = b'log_format doso_api_status '
    require(original.count(marker) == 1, 'expected_existing_https_status_log')
    offset = original.index(marker)
    previous = original[offset:]
    require(previous.count(OLD_FUNCTIONS) == 1 and NEW_FUNCTIONS not in previous,
            'expected_existing_four_function_allowlist')
    require(candidate == previous.replace(OLD_FUNCTIONS, NEW_FUNCTIONS, 1),
            'unexpected_https_configuration_change')
    return original[:offset] + candidate


def system_command(arguments):
    result = subprocess.run(arguments, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            stdin=subprocess.DEVNULL, timeout=30, check=False)
    require(result.returncode == 0, 'system_command_failed')


def write_site(content):
    with tempfile.NamedTemporaryFile(dir=SITE.parent, prefix='.doso-device-admin-', delete=False) as output:
        temporary = Path(output.name)
        try:
            os.chmod(temporary, 0o644)
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        os.replace(temporary, SITE)
    finally:
        temporary.unlink(missing_ok=True)


def install_nginx(original, candidate):
    updated = nginx_candidate(original, candidate)
    write_site(updated)
    try:
        system_command(['/usr/sbin/nginx', '-t'])
    except BaseException:
        write_site(original)
        system_command(['/usr/sbin/nginx', '-t'])
        raise
    try:
        system_command(['/bin/systemctl', 'reload', 'nginx'])
    except BaseException:
        write_site(original)
        system_command(['/usr/sbin/nginx', '-t'])
        system_command(['/bin/systemctl', 'reload', 'nginx'])
        raise


def postflight(docker):
    sql = b'begin read only;\n' + (HERE / 'sql/postflight.sql').read_bytes() + b'\ncommit;\n'
    output = docker.run(['exec', '-i', 'supabase-db', 'psql', '-X', '-U', 'postgres',
                         '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], data=sql, timeout=45)
    require(POSTFLIGHT_MARKER in output, 'database_postflight_not_confirmed')


def main():
    stage = 'preflight'
    backup = None
    descriptors = ()
    operation = sys.argv[1] if len(sys.argv) == 2 else None
    try:
        require(sys.platform == 'linux' and os.geteuid() == 0,
                'linux_root_required')
        require(operation in ('database', 'runtime'), 'use_database_or_runtime')
        require(Path(__file__).resolve() == HERE / 'deploy.py',
                'install_in_device_admin_directory')
        os.umask(0o077)
        import resource
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        base = load_module('doso_device_admin_runtime_base', HERE / 'runtime_base.py')
        database = load_module('doso_device_admin_database_base', HERE / 'database_base.py')
        core = load_module('doso_device_admin_core',
                           ROOT / 'tools/otp-six-20261027/start-shadow-core.py')
        layers = base.LAYERS + ('doso/device-cloud-20261103/compose.device-cloud.yml',)
        descriptors = core.lock_environment()
        original_env = ENV.read_bytes()
        with tempfile.TemporaryDirectory(prefix='doso-device-admin-', dir='/run') as private:
            docker = core.Docker(private)
            docker.compose = ['compose', '--project-name', 'doso-backend-shadow',
                              '--project-directory', str(WORK), '--env-file', str(ENV)]
            for layer in layers:
                docker.compose.extend(['-f', str(WORK / layer)])
            before = base.snapshot(docker)
            verify_active_layers(before, layers)
            before_model = json.loads(docker.run(docker.compose + ['config', '--format', 'json']))
            base.verify_actual_services(before_model, before)
            original_site = None
            if operation == 'runtime':
                postflight(docker)
                require(SITE.is_file() and not SITE.is_symlink() and
                        ENABLED_SITE.is_symlink() and ENABLED_SITE.resolve() == SITE,
                        'expected_active_api_site')
                original_site = SITE.read_bytes()
                nginx_candidate(original_site, (HERE / 'https.conf').read_bytes())
                system_command(['/usr/sbin/nginx', '-t'])
            backup = Path(tempfile.mkdtemp(prefix='device-admin-' + operation + '-', dir=ROOT / 'env'))
            (backup / '.env').write_bytes(original_env)
            (backup / 'containers-before.json').write_text(json.dumps(before), encoding='utf8')
            (backup / 'compose-before.json').write_text(json.dumps(before_model), encoding='utf8')
            (backup / 'layers.json').write_text(json.dumps(layers), encoding='utf8')
            for index, layer in enumerate(layers):
                (backup / f'layer-{index + 1:02d}.yml').write_bytes((WORK / layer).read_bytes())
            if operation == 'database':
                stage = 'database_apply'
                database.release(docker, HERE / 'sql', backup, commit_marker=COMMIT_MARKER)
                stage = 'database_postflight'
                postflight(docker)
            else:
                (backup / 'nginx-api.conf').write_bytes(original_site)
                after_compose = docker.compose + ['-f', str(WORK / LAYER)]
                after_model = json.loads(docker.run(after_compose + ['config', '--format', 'json']))
                verify_change(before_model, after_model)
                stage = 'envoy_validation'
                result = json.loads(docker.run(after_compose + ['run', '--rm', '--no-deps',
                    '--pull', 'never', '--entrypoint', 'node', 'api-gw', '/app/validate-config.mjs'], timeout=45))
                require(result.get('status') == 'gateway_bootstrap_validated', 'envoy_validation_failed')
                require(base.core_identity(base.snapshot(docker)) == base.core_identity(before),
                        'core_changed_during_preflight')
                for name in ('functions', 'api-gw'):
                    stage = name + '_update'
                    docker.run(after_compose + ['up', '--detach', '--no-deps', '--pull', 'never',
                        '--wait', '--wait-timeout', '60', name], timeout=90)
                stage = 'runtime_postcheck'
                after = base.snapshot(docker)
                base.verify_actual_services(after_model, after)
                require(base.core_identity(after) == base.core_identity(before), 'core_service_identity_changed')
                stage = 'nginx_update'
                require(SITE.read_bytes() == original_site, 'api_site_changed_during_release')
                install_nginx(original_site, (HERE / 'https.conf').read_bytes())
            stage = 'postcheck'
            require(ENV.read_bytes() == original_env, 'private_environment_changed')
            after = base.snapshot(docker)
            require(base.core_identity(after) == base.core_identity(before), 'core_service_identity_changed')
            print(json.dumps({'status': 'device_admin_' + operation + '_ready',
                              'backup': str(backup), 'running_services': len(after),
                              'core_services_preserved': True, 'https_verified': False}))
        return 0
    except BaseException as error:
        print(json.dumps({'status': 'device_admin_release_failed', 'operation': operation,
                          'stage': stage, 'reason': str(error) if isinstance(error, RuntimeError)
                          else type(error).__name__, 'backup': str(backup) if backup else None,
                          'secrets_printed': False}))
        return 1
    finally:
        for descriptor in reversed(descriptors):
            os.close(descriptor)


if __name__ == '__main__':
    raise SystemExit(main())
