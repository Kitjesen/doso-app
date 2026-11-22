#!/usr/bin/env python3
"""Read-only Compose diagnostics with environment values redacted."""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def redact(stderr, environment):
    values = set()
    for line in environment.splitlines():
        if '=' not in line or line.lstrip().startswith('#'):
            continue
        value = line.split('=', 1)[1].strip()
        values.add(value)
        value = value.strip("'\"")
        values.add(value)
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                values.update(item for item in parsed.values() if isinstance(item, str))
        except ValueError:
            pass
    result = stderr
    for value in sorted(values, key=len, reverse=True):
        if len(value) >= 3:
            result = result.replace(value, '[REDACTED]')
    return re.sub(r'sb_secret_[A-Za-z0-9_-]+', '[REDACTED]', result)


def main():
    descriptors = ()
    try:
        if sys.platform != 'linux' or os.geteuid() != 0 or len(sys.argv) != 1:
            raise RuntimeError('linux_root_no_arguments_required')
        os.umask(0o077)
        import resource
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        here = Path(__file__).resolve().parent
        release_spec = importlib.util.spec_from_file_location('device_cloud_release', here / 'deploy.py')
        release = importlib.util.module_from_spec(release_spec)
        release_spec.loader.exec_module(release)
        core_spec = importlib.util.spec_from_file_location('doso_existing_core', release.ROOT / 'tools/otp-six-20261027/start-shadow-core.py')
        core = importlib.util.module_from_spec(core_spec)
        core_spec.loader.exec_module(core)
        descriptors = core.lock_environment()
        environment = release.ENV.read_text(encoding='utf8')
        with tempfile.TemporaryDirectory(prefix='doso-compose-diagnostic-', dir='/run') as private:
            docker = core.Docker(private)
            command = docker.command + ['compose', '--project-name', 'doso-backend-shadow', '--project-directory', str(release.WORK), '--env-file', str(release.ENV)]
            for layer in release.LAYERS:
                command.extend(['-f', str(release.WORK / layer)])
            command.extend(['-f', str(here / 'compose.device-cloud.yml'), 'config', '--format', 'json'])
            result = subprocess.run(command, cwd=release.WORK, env=docker.environment, capture_output=True, stdin=subprocess.DEVNULL, timeout=30, check=False)
        sanitized = redact(result.stderr.decode('utf8', errors='replace'), environment)
        print(json.dumps({'compose_exit': result.returncode, 'stdout_bytes': len(result.stdout), 'stderr_redacted': sanitized[:12000]}))
        return 0
    except BaseException as error:
        print(json.dumps({'status': 'compose_diagnostic_failed', 'reason': type(error).__name__}))
        return 1
    finally:
        for descriptor in reversed(descriptors):
            os.close(descriptor)


if __name__ == '__main__':
    raise SystemExit(main())
