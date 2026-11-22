import copy
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import hashlib

ROOT = Path('/opt/doso-backend-shadow')
WORK = ROOT / 'runtime-20261027/docker'
HERE = WORK / 'doso/simulated-device-20261107'
PREVIOUS = WORK / 'doso/video-access-20261106'
ENV = ROOT / 'env/.env'
LAYER = 'doso/simulated-device-20261107/compose.simulated-device.yml'

def require(ok, reason):
    if not ok:
        raise RuntimeError(reason)

def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

def verify_change(before, after):
    expected = copy.deepcopy(before)
    volumes = expected['services']['functions']['volumes']
    mounts = [v for v in volumes if v.get('target') == '/home/deno/functions']
    require(len(mounts) == 1 and mounts[0]['source'] == str(PREVIOUS / 'functions'), 'unexpected_functions_mount')
    mounts[0]['source'] = str(HERE / 'functions')
    origins = expected['services']['functions'].setdefault('environment', {})
    existing = [s.strip() for s in origins.get('DOSO_ALLOWED_WEB_ORIGINS', '').split(',') if s.strip()]
    require(all(s == 'http://localhost:8081' for s in existing), 'existing_web_origins_require_preservation')
    require(origins.get('DOSO_ALLOW_ALL_WEB_ORIGINS_FOR_LOCAL_DEV', '').lower() != 'true', 'wildcard_origins_forbidden')
    origins['DOSO_ALLOWED_WEB_ORIGINS'] = 'http://localhost:8081'
    require(after == expected, 'unexpected_effective_compose_change')

def hashes(directory):
    return {str(p.relative_to(directory)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in directory.rglob('*') if p.is_file()}

def postflight(docker):
    result = docker.run(['exec', '-i', 'supabase-db', 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
                        data=b'begin read only;\n' + (HERE / 'sql/postflight.sql').read_bytes() + b'\ncommit;\n', timeout=45)
    require(b'PASS simulated_device_readonly_postflight' in result, 'postflight_not_confirmed')

def main():
    stage = 'preflight'
    descriptors = ()
    backup = None
    try:
        require(sys.platform == 'linux' and os.geteuid() == 0 and len(sys.argv) == 1, 'linux_root_no_arguments_required')
        require(Path(__file__).resolve() == HERE / 'deploy.py', 'install_in_release_directory')
        os.umask(0o077)
        core = module('sim_core', ROOT / 'tools/otp-six-20261027/start-shadow-core.py')
        base = module('sim_runtime', HERE / 'runtime_base.py')
        database = module('sim_database', HERE / 'database_base.py')
        descriptors = core.lock_environment()
        original_env = ENV.read_bytes()
        baseline = json.loads((HERE / 'baseline.json').read_text())
        require(hashes(PREVIOUS / 'functions') == baseline, 'active_function_snapshot_changed')
        changed = {p for p,h in hashes(HERE / 'functions').items() if baseline.get(p) != h}
        require(changed == {'admin-devices/handler.ts', 'remote-state/handler.ts'} and set(hashes(HERE / 'functions')) == set(baseline), 'unexpected_function_changes')
        layers = base.LAYERS + ('doso/device-cloud-20261103/compose.device-cloud.yml', 'doso/device-admin-20261104/compose.device-admin.yml', 'doso/video-access-20261106/compose.video-access.yml')
        with tempfile.TemporaryDirectory(prefix='doso-simulated-device-', dir='/run') as private:
            docker = core.Docker(private)
            docker.compose = ['compose', '--project-name', 'doso-backend-shadow', '--project-directory', str(WORK), '--env-file', str(ENV)]
            for layer in layers:
                docker.compose.extend(['-f', str(WORK / layer)])
            before = base.snapshot(docker)
            for name in ('functions','api-gw'):
                require(before[name]['Config']['Labels']['com.docker.compose.project.config_files'].split(',') == [str(WORK / p) for p in layers], 'expected_active_thirteen_layers')
            before_model = json.loads(docker.run(docker.compose + ['config','--format','json']))
            base.verify_actual_services(before_model, before)
            after_compose = docker.compose + ['-f', str(WORK / LAYER)]
            after_model = json.loads(docker.run(after_compose + ['config','--format','json']))
            verify_change(before_model, after_model)
            backup = Path(tempfile.mkdtemp(prefix='simulated-device-', dir=ROOT / 'env'))
            (backup / 'containers-before.json').write_text(json.dumps(before))
            (backup / 'compose-before.json').write_text(json.dumps(before_model))
            (backup / 'layers.json').write_text(json.dumps(layers))
            (backup / '.env').write_bytes(original_env)
            stage = 'database'
            database.release(docker, HERE / 'sql', backup, commit_marker=b'PASS simulated_device_transaction_committed')
            postflight(docker)
            stage = 'functions_update'
            try:
                docker.run(after_compose + ['up','--detach','--no-deps','--pull','never','--wait','--wait-timeout','60','functions'], timeout=90)
                after = base.snapshot(docker)
                base.verify_actual_services(after_model, after)
            except BaseException:
                docker.run(docker.compose + ['up','--detach','--no-deps','--pull','never','--wait','--wait-timeout','60','functions'], timeout=90)
                raise
            stage = 'postcheck'
            require(all(before[n]['Id'] == after[n]['Id'] and before[n]['State']['StartedAt'] == after[n]['State']['StartedAt'] for n in before if n != 'functions'), 'unrelated_service_changed')
            require(ENV.read_bytes() == original_env, 'private_environment_changed')
            postflight(docker)
            report = {'status':'simulated_device_ready','backup':str(backup),'running_services':len(after),'functions_changed':sorted(changed),'other_services_preserved':True,'environment_preserved':True}
            (HERE / 'deployment.json').write_text(json.dumps(report, indent=2))
            print(json.dumps(report))
        return 0
    except BaseException as error:
        print(json.dumps({'status':'simulated_device_release_failed','stage':stage,'reason':str(error) if isinstance(error, RuntimeError) else type(error).__name__,'backup':str(backup) if backup else None,'secrets_printed':False}))
        return 1
    finally:
        for fd in reversed(descriptors):
            os.close(fd)

if __name__ == '__main__':
    raise SystemExit(main())
