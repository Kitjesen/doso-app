#!/usr/bin/env python3
"""Back up and apply the one-time device-cloud SQL release separately."""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path('/opt/doso-backend-shadow')
HERE = ROOT / 'runtime-20261027/docker/doso/device-cloud-20261103'


def release(docker, sql, backup, commit_marker=b'PASS device_cloud_transaction_committed'):
    archive = backup / 'postgres.dump'
    options = {'env': docker.environment, 'cwd': str(HERE), 'stderr': subprocess.PIPE, 'timeout': 300, 'check': False}
    with archive.open('xb') as output:
        os.chmod(archive, 0o600)
        result = subprocess.run(docker.command + ['exec', 'supabase-db', 'pg_dump', '-U', 'postgres', '-d', 'postgres', '-Fc'], stdout=output, stdin=subprocess.DEVNULL, **options)
        output.flush()
        os.fsync(output.fileno())
    if result.returncode != 0 or archive.stat().st_size == 0:
        raise RuntimeError('database_backup_failed')
    with archive.open('rb') as source:
        result = subprocess.run(docker.command + ['exec', '-i', 'supabase-db', 'pg_restore', '--list'], stdin=source, stdout=subprocess.DEVNULL, **options)
    if result.returncode != 0:
        raise RuntimeError('database_backup_validation_failed')
    temporary = docker.run(['exec', 'supabase-db', 'mktemp', '-d', '/tmp/doso-device-cloud-sql-XXXXXXXX']).decode().strip()
    if not re.fullmatch(r'/tmp/doso-device-cloud-sql-[A-Za-z0-9]+', temporary):
        raise RuntimeError('invalid_sql_temporary_directory')
    try:
        docker.run(['cp', str(sql) + '/.', 'supabase-db:' + temporary])
        result = docker.run(['exec', 'supabase-db', 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', temporary + '/apply.sql'], timeout=180)
        if commit_marker not in result:
            raise RuntimeError('database_commit_not_confirmed')
    finally:
        docker.run(['exec', 'supabase-db', 'rm', '-rf', '--', temporary])


def main():
    backup = None
    descriptors = ()
    try:
        if sys.platform != 'linux' or os.geteuid() != 0 or len(sys.argv) != 1 or Path(__file__).resolve() != HERE / 'deploy-database.py':
            raise RuntimeError('linux_root_installed_path_no_arguments_required')
        os.umask(0o077)
        import resource
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        spec = importlib.util.spec_from_file_location('doso_existing_core', ROOT / 'tools/otp-six-20261027/start-shadow-core.py')
        core = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(core)
        descriptors = core.lock_environment()
        with tempfile.TemporaryDirectory(prefix='doso-device-cloud-db-', dir='/run') as private:
            docker = core.Docker(private)
            target = json.loads(docker.run(['container', 'inspect', 'supabase-db']))[0]
            labels = target['Config']['Labels']
            if labels.get('com.docker.compose.project') != 'doso-backend-shadow' or labels.get('com.docker.compose.service') != 'db' or not target['State']['Running'] or target['State'].get('Health', {}).get('Status') != 'healthy':
                raise RuntimeError('database_target_not_confirmed')
            backup = Path(tempfile.mkdtemp(prefix='device-cloud-database-20261103-', dir=str(ROOT / 'env')))
            os.chmod(backup, 0o700)
            release(docker, HERE / 'sql', backup)
        print(json.dumps({'status': 'device_cloud_database_committed', 'backup': str(backup), 'runtime_updated': False}))
        return 0
    except BaseException as error:
        print(json.dumps({'status': 'device_cloud_database_failed', 'reason': str(error) if isinstance(error, RuntimeError) else type(error).__name__, 'backup': str(backup) if backup else None, 'runtime_updated': False}))
        return 1
    finally:
        for descriptor in reversed(descriptors):
            os.close(descriptor)


if __name__ == '__main__':
    raise SystemExit(main())
