#!/usr/bin/env python3
"""Add locally entered SMTP credentials to the fixed, new shadow environment."""
import getpass
import hmac
import json
import os
import re
import secrets
import stat
import sys
import warnings

TARGET = '/opt/doso-backend-shadow/env/.env'
PENDING = b'# pending_smtp: cannot start the mandatory DOSO overlay until real SMTP is configured.\n'
LIMIT = 65536
SMTP = {
    'SMTP_HOST': 'smtpdm.aliyun.com',
    'SMTP_PORT': '465',
    'SMTP_USER': 'no-reply@auth.dosorobotics.com',
    'SMTP_ADMIN_EMAIL': 'no-reply@auth.dosorobotics.com',
    'SMTP_SENDER_NAME': 'DOSO',
}


class ConfigurationError(Exception):
    pass


def require_terminal():
    if not all(stream.isatty() and os.isatty(stream.fileno()) for stream in (sys.stdin, sys.stdout, sys.stderr)):
        raise ConfigurationError('interactive_terminal_required')


def open_directory():
    descriptor = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for component in ('', 'opt', 'doso-backend-shadow', 'env'):
            if component:
                child = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
                os.close(descriptor)
                descriptor = child
            info = os.fstat(descriptor)
            if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
                raise ConfigurationError('unsafe_parent_path')
            if component == 'env' and stat.S_IMODE(info.st_mode) != 0o700:
                raise ConfigurationError('private_root_directory_required')
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def validate_file(info):
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1 or not 0 < info.st_size <= LIMIT:
        raise ConfigurationError('private_regular_environment_required')


def read_environment(descriptor):
    os.lseek(descriptor, 0, os.SEEK_SET)
    with os.fdopen(descriptor, 'rb', closefd=False) as source:
        content = source.read(LIMIT + 1)
    if len(content) > LIMIT:
        raise ConfigurationError('environment_too_large')
    return content


def validate_pending(content):
    try:
        text = content.decode('utf-8')
    except UnicodeError:
        raise ConfigurationError('invalid_pending_environment') from None
    if not content.startswith(PENDING) or b'\x00' in content or not content.endswith(b'\n'):
        raise ConfigurationError('invalid_pending_environment')
    # Reject existing SMTP entries rather than silently replacing a prior setup.
    if re.search(r'^\s*(?:export\s+)?[\'\"]?SMTP_', text, re.MULTILINE):
        raise ConfigurationError('smtp_already_present')
    for key, value in (('SUPABASE_PUBLIC_URL', 'https://api-test.dosorobotics.com'), ('API_EXTERNAL_URL', 'https://api-test.dosorobotics.com/auth/v1')):
        if text.count(key + "='" + value + "'\n") != 1:
            raise ConfigurationError('shadow_origin_required')


def dotenv_value(value):
    # Compose interpolates double-quoted dotenv values; $$ preserves literal $.
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"').replace('$', '$$') + '"'


def render_environment(content, password):
    validate_pending(content)
    if not isinstance(password, str) or not password or len(password) > 4096 or any(ord(char) < 32 or ord(char) == 127 for char in password):
        raise ConfigurationError('invalid_smtp_password')
    values = dict(SMTP, SMTP_PASS=password)
    return content + ''.join(key + '=' + dotenv_value(value) + '\n' for key, value in values.items()).encode('utf-8')


def prompt_password():
    require_terminal()
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        password = getpass.getpass('DirectMail SMTP password (hidden): ', stream=sys.stderr)
        confirm = getpass.getpass('Repeat SMTP password (hidden): ', stream=sys.stderr)
    if not hmac.compare_digest(password.encode('utf-8'), confirm.encode('utf-8')):
        raise ConfigurationError('password_confirmation_mismatch')
    return password


def atomic_update(directory, descriptor, original, content):
    created = os.fstat(descriptor)
    validate_file(created)
    temporary = '.smtp-' + secrets.token_hex(16) + '.tmp'
    output = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
    pending = True
    try:
        with os.fdopen(output, 'wb', closefd=False) as destination:
            destination.write(content)
            destination.flush()
            os.fsync(output)
        current = os.stat('.env', dir_fd=directory, follow_symlinks=False)
        validate_file(current)
        if (current.st_dev, current.st_ino) != (created.st_dev, created.st_ino) or read_environment(descriptor) != original:
            raise ConfigurationError('environment_changed')
        os.replace(temporary, '.env', src_dir_fd=directory, dst_dir_fd=directory)
        pending = False
        try:
            os.fsync(directory)
        except OSError:
            raise ConfigurationError('update_durability_unconfirmed') from None
    finally:
        os.close(output)
        if pending:
            os.unlink(temporary, dir_fd=directory)


def configure():
    import fcntl
    directory = open_directory()
    descriptor = None
    try:
        # The directory lock survives atomic replacement of the .env inode.
        fcntl.flock(directory, fcntl.LOCK_EX | fcntl.LOCK_NB)
        descriptor = os.open('.env', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        validate_file(os.fstat(descriptor))
        original = read_environment(descriptor)
        validate_pending(original)
        password = prompt_password()
        content = render_environment(original, password)
        atomic_update(directory, descriptor, original, content)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        os.close(directory)


def main(argv=None):
    try:
        if (sys.argv[1:] if argv is None else argv):
            raise ConfigurationError('arguments_not_allowed')
        if sys.platform != 'linux' or not hasattr(os, 'O_NOFOLLOW') or os.geteuid() != 0:
            raise ConfigurationError('linux_root_required')
        require_terminal()
        import resource
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        os.umask(0o077)
        configure()
        print(json.dumps({'status': 'smtp_configured', 'credentials_printed': False, 'delivery_verified': False}))
        return 0
    except ConfigurationError as error:
        reason = str(error)
    except (KeyboardInterrupt, EOFError):
        reason = 'interrupted'
    except BaseException:
        reason = 'smtp_configuration_failed'
    print(json.dumps({'status': 'failed', 'reason': reason}))
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
