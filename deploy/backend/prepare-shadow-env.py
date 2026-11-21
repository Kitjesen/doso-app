#!/usr/bin/env python3
"""Prepare a new private test environment only; SMTP remains a mandatory gate."""
import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import tempfile
import time
import uuid
from urllib.parse import urlsplit
import base64

HERE = Path(__file__).resolve().parent
IMAGE = 'public.ecr.aws/supabase/postgres-meta@sha256:822227a8d12c109b24b8d8f1dae98a9c089a698b4586d35527dadf929e655136'
PUBLIC_ORIGIN = 'https://api-test.dosorobotics.com'
SITE_URL = 'doso://auth/callback'
CALLBACKS = (SITE_URL, 'doso://auth/reset-password', 'https://links.dosorobotics.com/auth/callback', 'https://links.dosorobotics.com/auth/reset-password')
KEY_NAMES = frozenset(('JWT_SECRET ANON_KEY SERVICE_ROLE_KEY SUPABASE_PUBLISHABLE_KEY SUPABASE_SECRET_KEY ANON_KEY_ASYMMETRIC SERVICE_ROLE_KEY_ASYMMETRIC JWT_KEYS JWT_JWKS SECRET_KEY_BASE REALTIME_DB_ENC_KEY VAULT_ENC_KEY PG_META_CRYPTO_KEY LOGFLARE_PUBLIC_ACCESS_TOKEN LOGFLARE_PRIVATE_ACCESS_TOKEN S3_PROTOCOL_ACCESS_KEY_ID S3_PROTOCOL_ACCESS_KEY_SECRET MINIO_ROOT_PASSWORD POSTGRES_PASSWORD DASHBOARD_PASSWORD').split())


class PreparationError(Exception):
    pass


def public_origin(value):
    parsed = urlsplit(value)
    if value != PUBLIC_ORIGIN or parsed.scheme != 'https' or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path:
        raise PreparationError('unapproved_public_origin')
    return value


def read_regular(path, limit):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
            raise PreparationError('invalid_source_file')
        with os.fdopen(descriptor, 'rb', closefd=False) as source:
            return source.read(limit + 1)
    finally:
        os.close(descriptor)


def locked_template(path):
    if Path(path).name != '.env.example':
        raise PreparationError('template_name_invalid')
    lock = json.loads(read_regular(HERE / 'upstream.lock.json', 20000))
    records = [item for item in lock['files'] if item['path'] == 'docker/.env.example']
    if lock['commit'] != 'bc27d2661edd09a5d0b8d76ce33da6d4071a756e' or len(records) != 1:
        raise PreparationError('template_lock_invalid')
    content = read_regular(path, 16000)
    record = records[0]
    if len(content) != record['size'] or hashlib.sha256(content).hexdigest() != record['sha256']:
        raise PreparationError('template_identity_mismatch')
    return content.decode('utf-8')


def open_destination(path):
    target = Path(path)
    if not target.is_absolute() or target.name != '.env' or '..' in target.parts:
        raise PreparationError('invalid_destination')
    for parent in reversed(target.parent.parents):
        info = os.lstat(parent)
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise PreparationError('unsafe_parent_path')
    descriptor = os.open(target.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700:
            raise PreparationError('private_root_directory_required')
        if os.listdir(descriptor):
            raise PreparationError('new_empty_directory_required')
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def generate_records():
    source = read_regular(HERE / 'generate-shadow-keys.mjs', 20000)
    name = 'doso-shadow-keys-' + secrets.token_hex(8)
    with tempfile.TemporaryDirectory(prefix='doso-shadow-keys-', dir='/run') as config:
        os.chmod(config, 0o700)
        if os.listdir(config):
            raise PreparationError('client_config_not_empty')
        environment = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': config, 'DOCKER_CONFIG': config, 'LANG': 'C', 'LC_ALL': 'C'}
        docker = ['/usr/bin/docker', '--config', config, '--host', 'unix:///var/run/docker.sock']
        cidfile = Path(config) / 'container.cid'
        command = docker + ['run', '--pull', 'never', '--rm', '-i', '--name', name, '--cidfile', str(cidfile), '--network', 'none', '--log-driver', 'none', '--read-only', '--no-healthcheck', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--ulimit', 'core=0:0', '--memory', '128m', '--memory-swap', '128m', '--cpus', '0.5', '--pids-limit', '32', '--entrypoint', 'node', IMAGE, '--input-type=module', '-', '--private-pipe']
        try:
            result = subprocess.run(command, input=source, capture_output=True, timeout=30, env=environment, check=False)
        except (subprocess.TimeoutExpired, KeyboardInterrupt) as error:
            try:
                cid = read_regular(cidfile, 64).decode('ascii')
                if not re.fullmatch(r'[0-9a-f]{64}', cid):
                    raise PreparationError('cleanup_unconfirmed')
                cleaned = subprocess.run(docker + ['rm', '-f', cid], capture_output=True, timeout=10, env=environment, check=False)
                if cleaned.returncode != 0:
                    raise PreparationError('cleanup_unconfirmed')
            except Exception:
                raise PreparationError('cleanup_unconfirmed') from None
            raise PreparationError('key_generator_timeout' if isinstance(error, subprocess.TimeoutExpired) else 'interrupted') from None
        if result.returncode != 0 or len(result.stdout) > 20000 or result.stderr:
            raise PreparationError('key_generator_failed')
        return json.loads(result.stdout)


def decode_base64url(value, size=None):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]+', value):
        raise PreparationError('key_encoding_invalid')
    decoded = base64.b64decode(value + '=' * (-len(value) % 4), altchars=b'-_', validate=True)
    if base64.urlsafe_b64encode(decoded).rstrip(b'=').decode() != value or (size is not None and len(decoded) != size):
        raise PreparationError('key_encoding_invalid')
    return decoded


def validate_records(records):
    if not isinstance(records, dict) or set(records) != KEY_NAMES or any(not isinstance(value, str) or not value or len(value) > 12000 or re.search(r"[\r\n\x00'$]", value) for value in records.values()):
        raise PreparationError('key_records_invalid')
    for name, size in (('JWT_SECRET', 30), ('SECRET_KEY_BASE', 48), ('PG_META_CRYPTO_KEY', 24), ('LOGFLARE_PUBLIC_ACCESS_TOKEN', 24), ('LOGFLARE_PRIVATE_ACCESS_TOKEN', 24)):
        value = records[name]
        decoded = base64.b64decode(value, validate=True)
        if len(decoded) != size or base64.b64encode(decoded).decode() != value:
            raise PreparationError('random_field_invalid')
    for name, size in (('REALTIME_DB_ENC_KEY', 8), ('VAULT_ENC_KEY', 16), ('S3_PROTOCOL_ACCESS_KEY_ID', 16), ('S3_PROTOCOL_ACCESS_KEY_SECRET', 32), ('MINIO_ROOT_PASSWORD', 16), ('POSTGRES_PASSWORD', 16), ('DASHBOARD_PASSWORD', 16)):
        if not re.fullmatch('[0-9a-f]{' + str(size * 2) + '}', records[name]):
            raise PreparationError('random_field_invalid')
    for name, prefix in (('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_'), ('SUPABASE_SECRET_KEY', 'sb_secret_')):
        value = records[name]
        if not re.fullmatch(re.escape(prefix) + r'[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}', value):
            raise PreparationError('opaque_key_invalid')
        checksum = base64.urlsafe_b64encode(hashlib.sha256(('supabase-self-hosted|' + value[:-9]).encode()).digest()).decode()[:8]
        if not hmac.compare_digest(checksum, value[-8:]):
            raise PreparationError('opaque_key_invalid')
    jwks = json.loads(records['JWT_JWKS'])
    signing = json.loads(records['JWT_KEYS'])
    if not isinstance(signing, list) or len(signing) != 2 or not isinstance(jwks, dict) or set(jwks) != {'keys'} or len(jwks['keys']) != 2:
        raise PreparationError('jwk_contract_invalid')
    private, oct_key = signing
    public, verify_oct = jwks['keys']
    public_fields = {'kty', 'kid', 'use', 'alg', 'ext', 'crv', 'x', 'y', 'key_ops'}
    if not isinstance(private, dict) or not isinstance(public, dict) or set(private) != public_fields | {'d'} or set(public) != public_fields or private['key_ops'] != ['sign', 'verify'] or public['key_ops'] != ['verify'] or private['kty'] != 'EC' or private['crv'] != 'P-256' or private['alg'] != 'ES256' or private['use'] != 'sig' or private['ext'] is not True or {key: value for key, value in private.items() if key not in ('d', 'key_ops')} != {key: value for key, value in public.items() if key != 'key_ops'} or oct_key != verify_oct or oct_key != {'kty': 'oct', 'k': base64.urlsafe_b64encode(records['JWT_SECRET'].encode()).rstrip(b'=').decode(), 'alg': 'HS256'}:
        raise PreparationError('jwk_contract_invalid')
    if str(uuid.UUID(private['kid'])) != private['kid'] or uuid.UUID(private['kid']).version != 4:
        raise PreparationError('jwk_contract_invalid')
    for field in ('x', 'y', 'd'):
        decode_base64url(private[field], 32)
    for name, role, algorithm in (('ANON_KEY', 'anon', 'HS256'), ('SERVICE_ROLE_KEY', 'service_role', 'HS256'), ('ANON_KEY_ASYMMETRIC', 'anon', 'ES256'), ('SERVICE_ROLE_KEY_ASYMMETRIC', 'service_role', 'ES256')):
        parts = records[name].split('.')
        if len(parts) != 3:
            raise PreparationError('jwt_contract_invalid')
        header = json.loads(decode_base64url(parts[0]))
        payload = json.loads(decode_base64url(parts[1]))
        expected_header = {'alg': algorithm, 'typ': 'JWT'}
        if algorithm == 'ES256':
            expected_header['kid'] = private['kid']
        if header != expected_header or not isinstance(payload, dict) or set(payload) != {'role', 'iss', 'iat', 'exp'} or payload['role'] != role or payload['iss'] != 'supabase' or type(payload['iat']) is not int or type(payload['exp']) is not int or abs(time.time() - payload['iat']) > 300 or payload['exp'] - payload['iat'] != 5 * 365 * 86400:
            raise PreparationError('jwt_contract_invalid')
        signature = decode_base64url(parts[2], 64 if algorithm == 'ES256' else 32)
        if algorithm == 'HS256' and not hmac.compare_digest(hmac.new(records['JWT_SECRET'].encode(), '.'.join(parts[:2]).encode(), hashlib.sha256).digest(), signature):
            raise PreparationError('legacy_signature_invalid')


def render_environment(template, records, origin):
    validate_records(records)
    values = dict(records, SUPABASE_PUBLIC_URL=origin, API_EXTERNAL_URL=origin + '/auth/v1', PROXY_DOMAIN=urlsplit(origin).hostname, SITE_URL=SITE_URL, ADDITIONAL_REDIRECT_URLS=','.join(CALLBACKS), DOSO_ALLOWED_WEB_ORIGINS='', COMPOSE_FILE='docker-compose.yml:docker-compose.caddy.yml:doso/compose.doso.yml:doso/compose.host-nginx.yml:doso/compose.images-amd64.yml')
    lines = ['# pending_smtp: cannot start the mandatory DOSO overlay until real SMTP is configured.']
    for line in template.splitlines():
        match = re.match(r'^([A-Z][A-Z0-9_]*)=', line)
        if match and (match[1].startswith('SMTP_') or match[1] == 'OPENAI_API_KEY'):
            continue
        if match and match[1] in values:
            key = match[1]
            lines.append(key + "='" + values.pop(key) + "'")
        else:
            lines.append(line)
    lines.extend(key + "='" + value + "'" for key, value in values.items())
    return ('\n'.join(lines) + '\n').encode('utf-8')


def write_environment(directory, content):
    descriptor = os.open('.env', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
    created = os.fstat(descriptor)
    try:
        with os.fdopen(descriptor, 'wb', closefd=False) as output:
            output.write(content)
            output.flush()
            os.fsync(descriptor)
        os.fsync(directory)
    except BaseException:
        current = os.stat('.env', dir_fd=directory, follow_symlinks=False)
        if (current.st_dev, current.st_ino) == (created.st_dev, created.st_ino):
            os.unlink('.env', dir_fd=directory)
        raise
    finally:
        os.close(descriptor)


def main(argv=None):
    try:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument('--template', required=True)
        parser.add_argument('--output', required=True)
        parser.add_argument('--public-origin', required=True)
        args = parser.parse_args(argv)
        if os.name != 'posix' or not hasattr(os, 'O_NOFOLLOW') or os.geteuid() != 0:
            raise PreparationError('linux_root_required')
        import resource
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        os.umask(0o077)
        origin = public_origin(args.public_origin)
        template = locked_template(args.template)
        directory = open_destination(args.output)
        try:
            records = generate_records()
            content = render_environment(template, records, origin)
            write_environment(directory, content)
        finally:
            os.close(directory)
        print(json.dumps({'status': 'pending_smtp', 'can_start': False, 'credentials_printed': False}))
        return 0
    except PreparationError as error:
        print(json.dumps({'status': 'failed', 'reason': str(error)}))
        return 1
    except Exception:
        print(json.dumps({'status': 'failed', 'reason': 'prepare_failed'}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
