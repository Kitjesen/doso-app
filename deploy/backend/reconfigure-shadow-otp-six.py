#!/usr/bin/env python3
"""Change only the running new Auth service from eight to six email OTP digits."""
import copy
import hashlib
import json
import os
from pathlib import PurePosixPath
import secrets
import stat
import subprocess
import sys
import tempfile
import types

TOOLS = '/opt/doso-backend-shadow/tools'
BUNDLE = TOOLS + '/otp-six-20261027'
CORE_PATH = BUNDLE + '/start-shadow-core.py'
CANDIDATE = BUNDLE + '/verify-shadow-signup-six-candidate.py'
OVERLAY_SOURCE = BUNDLE + '/compose.email-otp-six.yml'
INSTALLED = TOOLS + '/verify-shadow-signup.py'
CORE_HASH = 'c8966100b31118b0ba775b4af18f4022ffed42f69159a96d06e9f3751f4d7d82'
CANDIDATE_HASH = '7aaa196b86a2665b8adce2c8b84f51745f42f2e27d0bfcdabc4a6b69289caad6'
OVERLAY_HASH = '494166fb660c6f226e8d3a1045cd9d26f295ebe05b85fca217fd7c45711cf7d4'
INSTALLED_HASH = 'b189a0c81fe5ff40aecee7c0b2d38ff14f41758a01284fa7538c4a97171dd667'
OTP = 'GOTRUE_MAILER_OTP_LENGTH'


class ReconfigureError(Exception):
    pass


def require(condition, reason):
    if not condition:
        raise ReconfigureError(reason)


def read_public_source(path, expected, mode=None):
    parts = PurePosixPath(path).parts
    require(path in (CORE_PATH, CANDIDATE, OVERLAY_SOURCE, INSTALLED) and '..' not in parts, 'unapproved_source_path')
    directory = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    descriptor = None
    try:
        for component in ('', *parts[1:-1]):
            if component:
                child = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
                os.close(directory)
                directory = child
            info = os.fstat(directory)
            require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022, 'unsafe_source_directory')
        require(stat.S_IMODE(info.st_mode) == 0o700, 'private_tools_directory_required')
        descriptor = os.open(parts[-1], os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW, dir_fd=directory)
        info = os.fstat(descriptor)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and not info.st_mode & 0o022 and 0 < info.st_size <= 256 * 1024 and (mode is None or stat.S_IMODE(info.st_mode) == mode), 'unsafe_source_file')
        with os.fdopen(descriptor, 'rb', closefd=False) as source:
            content = source.read(256 * 1024 + 1)
        require(len(content) <= 256 * 1024 and hashlib.sha256(content).hexdigest() == expected, 'source_hash_mismatch')
        return content, (info.st_dev, info.st_ino)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        os.close(directory)


def reviewed_sources():
    source, _ = read_public_source(CORE_PATH, CORE_HASH)
    candidate, _ = read_public_source(CANDIDATE, CANDIDATE_HASH)
    overlay, _ = read_public_source(OVERLAY_SOURCE, OVERLAY_HASH)
    _, installed_identity = read_public_source(INSTALLED, INSTALLED_HASH, 0o600)
    require(overlay == b'services:\n  auth:\n    environment:\n      GOTRUE_MAILER_OTP_LENGTH: 6\n', 'unexpected_overlay_source')
    core = types.ModuleType('doso_reviewed_otp_core')
    core.__file__ = CORE_PATH
    exec(compile(source, CORE_PATH, 'exec'), core.__dict__)
    return core, candidate, overlay, installed_identity


def actual_environment(docker, cid):
    values = json.loads(docker.run(['container', 'inspect', cid, '--format', '{{json .Config.Env}}']))
    require(isinstance(values, list), 'invalid_actual_auth_environment')
    result = {}
    for value in values:
        require(isinstance(value, str) and '=' in value, 'invalid_actual_auth_environment')
        key, data = value.split('=', 1)
        require(key and key not in result, 'invalid_actual_auth_environment')
        result[key] = data
    return result


def verify_configured_environment(configured, actual):
    require(actual.get(OTP) == '8', 'eight_digit_auth_required')
    for key, value in configured.items():
        if value is None:
            require(key not in actual, 'actual_auth_environment_mismatch')
        else:
            require(isinstance(value, str) and '$' not in value.replace('$$', '') and actual.get(key) == value.replace('$$', '$'), 'actual_auth_environment_mismatch')


def verify_model_change(before, after):
    require(before['services']['auth']['environment'].get(OTP) == '8', 'eight_digit_model_required')
    expected = copy.deepcopy(before)
    expected['services']['auth']['environment'][OTP] = '6'
    require(after == expected, 'unexpected_compose_model_change')


def write_overlay(core, content):
    directory = core.open_directory(core.WORK + '/doso')
    descriptor = None
    try:
        descriptor = os.open('compose.email-otp-six.yml', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
        with os.fdopen(descriptor, 'wb', closefd=False) as output:
            output.write(content)
            output.flush()
            os.fsync(descriptor)
        os.fsync(directory)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        os.close(directory)


def replace_test_script(core, candidate, original_identity):
    directory = core.open_directory(TOOLS, 0o700)
    temporary = '.verify-shadow-signup-' + secrets.token_hex(16) + '.tmp'
    descriptor = None
    pending = False
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
        pending = True
        with os.fdopen(descriptor, 'wb', closefd=False) as output:
            output.write(candidate)
            output.flush()
            os.fsync(descriptor)
        _, current_identity = read_public_source(INSTALLED, INSTALLED_HASH, 0o600)
        current = os.stat('verify-shadow-signup.py', dir_fd=directory, follow_symlinks=False)
        require(current_identity == original_identity == (current.st_dev, current.st_ino) and stat.S_ISREG(current.st_mode) and current.st_uid == 0 and current.st_nlink == 1 and stat.S_IMODE(current.st_mode) == 0o600, 'installed_test_script_changed')
        os.replace(temporary, 'verify-shadow-signup.py', src_dir_fd=directory, dst_dir_fd=directory)
        pending = False
        os.fsync(directory)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if pending:
            os.unlink(temporary, dir_fd=directory)
        os.close(directory)


def main(argv=None):
    stage = 'preflight'
    auth_change_attempted = False
    descriptors = ()
    core = None
    try:
        require(not (sys.argv[1:] if argv is None else argv), 'arguments_not_allowed')
        require(sys.platform == 'linux' and os.geteuid() == 0, 'linux_root_required')
        import resource
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        os.umask(0o077)
        core, candidate, overlay, installed_identity = reviewed_sources()
        descriptors = core.lock_environment()
        core.validate_runtime()
        with tempfile.TemporaryDirectory(prefix='doso-otp-six-', dir='/run') as private:
            os.chmod(private, 0o700)
            require(not os.listdir(private), 'private_docker_config_not_empty')
            docker = core.Docker(private)
            before_model = json.loads(docker.run(docker.compose + ['config', '--format', 'json']))
            core.validate_model(before_model)
            require(before_model['services']['auth']['environment'].get(OTP) == '8', 'eight_digit_model_required')
            before_ids = docker.verify_started()
            before_env = actual_environment(docker, before_ids['auth'])
            verify_configured_environment(before_model['services']['auth']['environment'], before_env)
            website_before = core.website_snapshot()
            stage = 'overlay_install'
            write_overlay(core, overlay)
            seven = docker.compose + ['-f', core.WORK + '/doso/compose.email-otp-six.yml']
            after_model = json.loads(docker.run(seven + ['config', '--format', 'json']))
            core.validate_model(after_model)
            verify_model_change(before_model, after_model)
            require(docker.verify_started() == before_ids, 'services_changed_during_preflight')
            stage = 'auth_reconfigure'
            auth_change_attempted = True
            print('{"status":"reconfiguring_shadow_auth_otp_six"}', flush=True)
            docker.run(seven + ['up', '--no-deps', '-d', '--wait', '--wait-timeout', '90', '--pull', 'never', 'auth'], timeout=120)
            stage = 'postcheck'
            after_ids = docker.verify_started()
            require(after_ids['auth'] != before_ids['auth'] and all(after_ids[name] == before_ids[name] for name in ('db', 'rest', 'mail-templates')), 'unexpected_container_change')
            expected_env = dict(before_env, **{OTP: '6'})
            require(actual_environment(docker, after_ids['auth']) == expected_env, 'unexpected_actual_auth_environment_change')
            docker.probe(after_ids['rest'])
            require(core.website_snapshot() == website_before, 'existing_website_changed')
            require(docker.verify_started() == after_ids, 'services_changed_during_postcheck')
            stage = 'script_replace'
            replace_test_script(core, candidate, installed_identity)
        print('{"status":"otp_six_reconfigured","auth_healthy":true,"other_service_ids_unchanged":true,"auth_environment_only_otp_changed":true,"website_preserved":true,"six_digit_test_installed":true,"signup_performed":false,"credentials_printed":false}')
        return 0
    except ReconfigureError as error:
        reason = str(error)
    except subprocess.TimeoutExpired:
        reason = 'docker_command_timed_out'
    except (KeyboardInterrupt, EOFError):
        reason = 'interrupted'
    except BaseException as error:
        reason = 'reviewed_core_guard_failed' if core is not None and isinstance(error, core.GuardError) else 'otp_reconfigure_failed'
    finally:
        for descriptor in reversed(descriptors):
            os.close(descriptor)
    print(json.dumps({'status': 'failed', 'stage': stage, 'reason': reason, 'auth_may_have_changed': auth_change_attempted, 'test_script_may_have_changed': stage == 'script_replace', 'credentials_printed': False}))
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
