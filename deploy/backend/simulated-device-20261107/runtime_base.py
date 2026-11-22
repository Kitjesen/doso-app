#!/usr/bin/env python3
"""Append the device-cloud layer to the existing ten-layer Aliyun stack."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import sys
import tempfile

ROOT = Path('/opt/doso-backend-shadow')
WORK = ROOT / 'runtime-20261027/docker'
ENV = ROOT / 'env/.env'
HERE = WORK / 'doso/device-cloud-20261103'
LAYERS = (
    'docker-compose.yml', 'docker-compose.caddy.yml', 'doso/compose.doso.yml',
    'doso/compose.host-nginx.yml', 'doso/compose.images-amd64.yml',
    'doso/compose.mail-templates.yml', 'doso/compose.email-otp-six.yml',
    'doso/mail-layout-20261027/compose.mail-layout.yml',
    'doso/gateway-loopback-20261027/compose.gateway-loopback.yml',
    'doso/account-sessions-20261027/compose.account-sessions.yml',
)
SERVICES = {'db', 'auth', 'rest', 'mail-templates', 'api-gw', 'functions'}
CORE = SERVICES - {'api-gw', 'functions'}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sync_environment(content):
    lines = content.splitlines(keepends=True)
    matches = [index for index, line in enumerate(lines) if re.match(r'^SUPABASE_SECRET_KEYS=', line)]
    require(len(matches) <= 1, 'duplicate_named_key_environment')
    values = {}
    if matches:
        encoded = lines[matches[0]].strip().split('=', 1)[1]
        if encoded.startswith("'") and encoded.endswith("'"):
            encoded = encoded[1:-1]
        try:
            values = json.loads(encoded)
        except (ValueError, TypeError):
            raise RuntimeError('invalid_named_key_environment') from None
        require(isinstance(values, dict) and all(isinstance(key, str) and isinstance(value, str) and value.strip() for key, value in values.items()), 'invalid_named_key_environment')
    if 'remote-state-sync' in values:
        require(values['remote-state-sync'].startswith('sb_secret_') and len(values['remote-state-sync']) >= 40, 'invalid_existing_sync_key')
        return content
    values['remote-state-sync'] = 'sb_secret_' + secrets.token_urlsafe(32)
    encoded = json.dumps(values, separators=(',', ':')).replace("'", '\\u0027')
    line = "SUPABASE_SECRET_KEYS='" + encoded + "'\n"
    if matches:
        lines[matches[0]] = line
        return ''.join(lines)
    return content.rstrip('\n') + '\n' + line


def verify_change(before, after):
    expected = copy.deepcopy(before)
    for name in ('api-gw', 'functions'):
        old = expected['services'][name]
        for mount in old['volumes']:
            if mount.get('type') == 'bind' and 'account-sessions-20261027' in mount.get('source', ''):
                mount['source'] = mount['source'].replace('account-sessions-20261027', 'device-cloud-20261103')
    environment = expected['services']['functions']['environment']
    environment['SUPABASE_SECRET_KEYS'] = after['services']['functions']['environment']['SUPABASE_SECRET_KEYS']
    environment['DOSO_REMOTE_SYNC_SECRET_NAME'] = 'remote-state-sync'
    require(after == expected, 'unexpected_effective_compose_change')
    keys = json.loads(environment['SUPABASE_SECRET_KEYS'])
    require(isinstance(keys.get('remote-state-sync'), str) and len(keys['remote-state-sync']) >= 40, 'missing_sync_key')
    require(keys['remote-state-sync'] not in {environment['SUPABASE_ANON_KEY'], environment['SUPABASE_SERVICE_ROLE_KEY']}, 'sync_key_reuses_api_key')


def snapshot(docker):
    ids = docker.run(['container', 'ls', '-aq', '--filter', 'label=com.docker.compose.project=doso-backend-shadow']).decode().splitlines()
    require(len(ids) == 6, 'expected_six_existing_containers')
    records = json.loads(docker.run(['container', 'inspect', *ids]))
    found = {}
    for record in records:
        labels = record['Config']['Labels']
        name = labels.get('com.docker.compose.service')
        health = record['State'].get('Health')
        ready = health is not None and health.get('Status') == 'healthy'
        unchecked_function = name == 'functions' and health is None
        require(name in SERVICES and name not in found and record['State']['Running'] and (ready or unchecked_function), 'existing_service_not_ready')
        found[name] = record
    require(set(found) == SERVICES, 'unexpected_existing_services')
    return found


def core_identity(records):
    return {
        name: {key: records[name][key] for key in ('Id', 'Created', 'Config', 'HostConfig')}
        | {'Mounts': sorted(records[name]['Mounts'], key=lambda mount: mount['Destination']), 'StartedAt': records[name]['State']['StartedAt']}
        for name in CORE
    }


def verify_active_layers(records):
    labels = records['functions']['Config']['Labels']
    require(labels.get('com.docker.compose.project.working_dir') == str(WORK), 'unexpected_compose_working_directory')
    actual = labels.get('com.docker.compose.project.config_files', '').split(',')
    require(actual == [str(WORK / layer) for layer in LAYERS], 'expected_active_ten_layers')
    for name in ('api-gw', 'functions'):
        mounts = records[name]['Mounts']
        expected = str(WORK / 'doso/account-sessions-20261027')
        require(any(mount.get('Source', '').startswith(expected + '/') for mount in mounts), 'expected_account_sessions_mounts')


def verify_actual_services(model, records):
    for name in ('api-gw', 'functions'):
        configured = model['services'][name]
        actual = records[name]
        require(actual['Config']['Image'] == configured['image'], 'actual_service_image_mismatch')
        environment = dict(item.split('=', 1) for item in actual['Config']['Env'])
        for key, value in configured.get('environment', {}).items():
            require(environment.get(key) == (value.replace('$$', '$') if isinstance(value, str) else value), 'actual_service_environment_mismatch')
        for mount in configured['volumes']:
            if mount.get('type') == 'bind':
                require(any(item['Type'] == 'bind' and item['Source'] == mount['source'] and item['Destination'] == mount['target'] and not item['RW'] for item in actual['Mounts']), 'actual_service_bind_mismatch')


def main():
    stage = 'preflight'
    backup = None
    descriptors = ()
    try:
        require(sys.platform == 'linux' and os.geteuid() == 0 and len(sys.argv) == 1, 'linux_root_no_arguments_required')
        require(Path(__file__).resolve() == HERE / 'deploy.py', 'install_in_device_cloud_directory')
        os.umask(0o077)
        import resource
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        core_path = ROOT / 'tools/otp-six-20261027/start-shadow-core.py'
        spec = importlib.util.spec_from_file_location('doso_existing_core', core_path)
        core = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(core)
        descriptors = core.lock_environment()
        original_env = ENV.read_bytes()
        with tempfile.TemporaryDirectory(prefix='doso-device-cloud-', dir='/run') as private:
            docker = core.Docker(private)
            docker.compose = ['compose', '--project-name', 'doso-backend-shadow', '--project-directory', str(WORK), '--env-file', str(ENV)]
            for layer in LAYERS:
                docker.compose.extend(['-f', str(WORK / layer)])
            before = snapshot(docker)
            verify_active_layers(before)
            before_model = json.loads(docker.run(docker.compose + ['config', '--format', 'json']))
            verify_actual_services(before_model, before)
            backup = Path(tempfile.mkdtemp(prefix='device-cloud-20261103-', dir=str(ROOT / 'env')))
            (backup / '.env').write_bytes(original_env)
            (backup / 'containers-before.json').write_text(json.dumps(before), encoding='utf8')
            (backup / 'compose-before.json').write_text(json.dumps(before_model), encoding='utf8')
            (backup / 'layers.json').write_text(json.dumps(LAYERS), encoding='utf8')
            for index, layer in enumerate(LAYERS):
                (backup / f'layer-{index + 1:02d}.yml').write_bytes((WORK / layer).read_bytes())
            stage = 'private_environment'
            updated_env = sync_environment(original_env.decode('utf8'))
            with tempfile.NamedTemporaryFile(dir=ENV.parent, prefix='.device-cloud-env-', delete=False) as output:
                temporary = Path(output.name)
                output.write(updated_env.encode('utf8'))
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, ENV)
            after_compose = docker.compose + ['-f', str(HERE / 'compose.device-cloud.yml')]
            after_model = json.loads(docker.run(after_compose + ['config', '--format', 'json']))
            verify_change(before_model, after_model)
            stage = 'envoy_validation'
            result = json.loads(docker.run(after_compose + ['run', '--rm', '--no-deps', '--pull', 'never', '--entrypoint', 'node', 'api-gw', '/app/validate-config.mjs'], timeout=45))
            require(result.get('status') == 'gateway_bootstrap_validated', 'envoy_validation_failed')
            require(core_identity(snapshot(docker)) == core_identity(before), 'core_changed_during_preflight')
            stage = 'functions_update'
            docker.run(after_compose + ['up', '--detach', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '60', 'functions'], timeout=90)
            stage = 'gateway_update'
            docker.run(after_compose + ['up', '--detach', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '60', 'api-gw'], timeout=90)
            stage = 'postcheck'
            after = snapshot(docker)
            require(core_identity(after) == core_identity(before), 'core_service_identity_changed')
            verify_actual_services(after_model, after)
            checked = [record for record in after.values() if record['State'].get('Health') is not None]
            print(json.dumps({'status': 'device_cloud_increment_ready', 'running_services': len(after), 'healthchecked_services': len(checked), 'healthy_services': sum(record['State']['Health']['Status'] == 'healthy' for record in checked), 'core_services_preserved': True, 'backup': str(backup), 'https_verified': False}))
        return 0
    except BaseException as error:
        print(json.dumps({'status': 'device_cloud_increment_failed', 'stage': stage, 'reason': str(error) if isinstance(error, RuntimeError) else type(error).__name__, 'backup': str(backup) if backup else None, 'secrets_printed': False}))
        return 1
    finally:
        for descriptor in reversed(descriptors):
            os.close(descriptor)


if __name__ == '__main__':
    raise SystemExit(main())
