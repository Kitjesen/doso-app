#!/usr/bin/env python3
"""Interactive internal Auth signup smoke; retain the new test account, no App session claim."""
import base64
import getpass
import hmac
import http.client
import ipaddress
import json
import os
import re
import signal
import subprocess
import sys
import tempfile
import time
import uuid
import warnings

PROJECT = 'doso-backend-shadow'
NETWORK = PROJECT + '_default'
IMAGE = 'ghcr.io/supabase/gotrue@sha256:839f529492d116b4e8b7777c953a27c381d34c15a744b1bcefde5eefaa1f9f9f'
INSPECT = '{{$first := true}}{"name":{{json .Name}},"labels":{{json .Config.Labels}},"image":{{json .Config.Image}},"running":{{json .State.Running}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}},"networks":[{{range $name,$network := .NetworkSettings.Networks}}{{if $first}}{{$first = false}}{{else}},{{end}}{"name":{{json $name}},"ip":{{json $network.IPAddress}}}{{end}}],"otp_config":[{{$otp_first := true}}{{range .Config.Env}}{{if eq (index (split . "=") 0) "GOTRUE_MAILER_OTP_LENGTH"}}{{if $otp_first}}{{$otp_first = false}}{{else}},{{end}}{{json .}}{{end}}{{end}}]}'
PRIVATE_NETWORKS = tuple(ipaddress.IPv4Network(value) for value in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'))
REQUESTS = frozenset((('POST', '/signup'), ('POST', '/verify'), ('POST', '/token?grant_type=password'), ('GET', '/user')))
LIMIT = 1024 * 1024


class SmokeError(Exception):
    pass


def require(condition, reason):
    if not condition:
        raise SmokeError(reason)


def require_terminal():
    require(all(stream.isatty() and os.isatty(stream.fileno()) for stream in (sys.stdin, sys.stdout, sys.stderr)), 'interactive_terminal_required')


def hidden(prompt):
    require_terminal()
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        return getpass.getpass(prompt, stream=sys.stderr)


def credentials():
    require_terminal()
    email = input('NEW test email (the new account will be retained): ').strip().lower()
    require(len(email) <= 254 and email.isascii() and email.count('@') == 1, 'invalid_test_email')
    local, domain = email.split('@')
    require(0 < len(local) <= 64 and re.fullmatch(r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]+", local) and not local.startswith('.') and not local.endswith('.') and '..' not in local and '.' in domain and all(re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', label) for label in domain.split('.')), 'invalid_test_email')
    password = hidden('NEW test password (hidden, 10+ with upper/lower/digit): ')
    confirm = hidden('Repeat NEW test password (hidden): ')
    require(10 <= len(password) <= 128 and all(ord(char) >= 32 and ord(char) != 127 for char in password) and re.search('[a-z]', password) and re.search('[A-Z]', password) and re.search('[0-9]', password), 'invalid_test_password')
    require(hmac.compare_digest(password.encode('utf-8'), confirm.encode('utf-8')), 'password_confirmation_mismatch')
    return email, password


def signup_otp():
    value = hidden('Email signup code, exactly 6 digits (hidden): ')
    require(re.fullmatch('[0-9]{6}', value), 'invalid_signup_code')
    return value


def target_address(record):
    require(isinstance(record, dict), 'new_auth_identity_required')
    labels = record.get('labels') or {}
    require(isinstance(labels, dict), 'new_auth_identity_required')
    require(record.get('name') == '/supabase-auth' and labels.get('com.docker.compose.project') == PROJECT and labels.get('com.docker.compose.service') == 'auth' and record.get('image') == IMAGE and record.get('running') is True and record.get('health') == 'healthy', 'new_auth_identity_required')
    require(record.get('otp_config') == ['GOTRUE_MAILER_OTP_LENGTH=6'], 'six_digit_auth_required')
    networks = record.get('networks')
    require(isinstance(networks, list) and len(networks) == 1 and isinstance(networks[0], dict) and networks[0].get('name') == NETWORK, 'new_auth_network_required')
    address = networks[0].get('ip')
    try:
        parsed = ipaddress.IPv4Address(address)
    except (ValueError, TypeError):
        raise SmokeError('private_auth_ip_required') from None
    require(isinstance(address, str) and str(parsed) == address and any(parsed in network for network in PRIVATE_NETWORKS), 'private_auth_ip_required')
    return address


class Docker:
    def __init__(self, private):
        self.command = ['/usr/bin/docker', '--config', private, '--host', 'unix:///var/run/docker.sock']
        self.environment = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': private, 'DOCKER_CONFIG': private, 'LANG': 'C', 'LC_ALL': 'C'}

    def inspect(self):
        try:
            result = subprocess.run(self.command + ['container', 'inspect', 'supabase-auth', '--format', INSPECT], stdin=subprocess.DEVNULL, capture_output=True, timeout=20, env=self.environment, check=False)
        except (OSError, subprocess.TimeoutExpired):
            raise SmokeError('auth_inspection_failed') from None
        require(result.returncode == 0 and len(result.stdout) <= 65536, 'auth_inspection_failed')
        try:
            value = json.loads(result.stdout)
        except (ValueError, UnicodeError):
            raise SmokeError('auth_inspection_failed') from None
        require(isinstance(value, dict), 'auth_inspection_failed')
        return value


class Auth:
    def __init__(self, docker):
        self.docker = docker
        self.address = target_address(docker.inspect())

    def request(self, method, route, body=None, bearer=None):
        require((method, route) in REQUESTS, 'unapproved_auth_request')
        require(target_address(self.docker.inspect()) == self.address, 'auth_target_changed')
        headers = {'Accept': 'application/json', 'Accept-Encoding': 'identity', 'Connection': 'close'}
        if bearer is not None:
            require(method == 'GET' and route == '/user' and isinstance(bearer, str) and re.fullmatch(r'[A-Za-z0-9_.-]{128,16384}', bearer), 'invalid_access_token')
            headers['Authorization'] = 'Bearer ' + bearer
        data = None
        if body is not None:
            headers['Content-Type'] = 'application/json'
            data = json.dumps(body, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
        def expired(_signal, _frame):
            raise SmokeError('auth_request_timed_out')
        previous = signal.signal(signal.SIGALRM, expired)
        connection = http.client.HTTPConnection(self.address, 9999, timeout=20)
        try:
            signal.alarm(20)
            connection.request(method, route, body=data, headers=headers)
            response = connection.getresponse()
            require(response.status in (200, 201), 'auth_request_rejected')
            require((response.getheader('Content-Type') or '').split(';')[0].strip().lower() == 'application/json' and response.getheader('Content-Encoding') in (None, 'identity'), 'invalid_auth_response')
            raw = response.read(LIMIT + 1)
            require(len(raw) <= LIMIT, 'auth_response_too_large')
            try:
                value = json.loads(raw)
            except (ValueError, UnicodeError):
                raise SmokeError('invalid_auth_response') from None
            require(isinstance(value, dict), 'invalid_auth_response')
            return value
        except TimeoutError:
            raise SmokeError('auth_request_timed_out') from None
        except (OSError, http.client.HTTPException):
            raise SmokeError('auth_transport_failed') from None
        finally:
            connection.close()
            signal.alarm(0)
            signal.signal(signal.SIGALRM, previous)


def user_id(reply, email, expected=None, confirmed=False):
    user = reply.get('user', reply)
    require(isinstance(user, dict), 'invalid_auth_user')
    value = user.get('id')
    try:
        parsed = uuid.UUID(value)
    except (ValueError, TypeError, AttributeError):
        raise SmokeError('invalid_auth_user') from None
    require(isinstance(value, str) and str(parsed) == value and parsed.variant == uuid.RFC_4122 and parsed.int != 0 and user.get('email') == email and (expected is None or value == expected), 'auth_user_mismatch')
    if confirmed:
        confirmation = user.get('email_confirmed_at') or user.get('confirmed_at')
        require(isinstance(confirmation, str) and bool(confirmation.strip()), 'email_confirmation_required')
    return value


def signup_user(reply, email):
    require(reply.get('session') is None and not any(reply.get(name) for name in ('access_token', 'refresh_token', 'token_type')), 'unexpected_signup_session')
    value = user_id(reply, email)
    user = reply.get('user', reply)
    require(not user.get('email_confirmed_at') and not user.get('confirmed_at'), 'unexpected_signup_confirmation')
    return value


def access_token(reply, expected):
    token = reply.get('access_token')
    require(isinstance(token, str) and 128 <= len(token) <= 16384 and re.fullmatch(r'[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', token) and isinstance(reply.get('token_type'), str) and reply['token_type'].lower() == 'bearer', 'invalid_access_token')
    parts = token.split('.')
    try:
        decoded = [base64.b64decode(part + '=' * (-len(part) % 4), altchars=b'-_', validate=True) for part in parts]
        require(all(base64.urlsafe_b64encode(value).rstrip(b'=').decode('ascii') == part for value, part in zip(decoded, parts)), 'invalid_access_token')
        header, claims = json.loads(decoded[0]), json.loads(decoded[1])
    except (ValueError, UnicodeError):
        raise SmokeError('invalid_access_token') from None
    require(isinstance(header, dict) and isinstance(claims, dict) and header.get('typ') == 'JWT' and header.get('alg') in ('HS256', 'ES256') and len(decoded[2]) == (32 if header.get('alg') == 'HS256' else 64), 'invalid_access_token')
    require(claims.get('sub') == expected and claims.get('role') == 'authenticated' and claims.get('aud') in ('authenticated', ['authenticated']) and type(claims.get('exp')) is int and claims['exp'] > time.time(), 'access_token_identity_mismatch')
    return token


def main(argv=None):
    stage = 'preflight'
    signup_started = False
    signup_accepted = False
    try:
        require(not (sys.argv[1:] if argv is None else argv), 'arguments_not_allowed')
        require(sys.platform == 'linux' and os.geteuid() == 0, 'linux_root_required')
        require_terminal()
        import resource
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        os.umask(0o077)
        with tempfile.TemporaryDirectory(prefix='doso-signup-', dir='/run') as private:
            os.chmod(private, 0o700)
            require(not os.listdir(private), 'private_docker_config_not_empty')
            auth = Auth(Docker(private))
            stage = 'new_test_input'
            email, password = credentials()
            stage = 'signup'
            signup_started = True
            created = auth.request('POST', '/signup', {'email': email, 'password': password})
            expected = signup_user(created, email)
            signup_accepted = True
            print('{"status":"signup_pending_confirmation","signup_no_session":true}', flush=True)
            stage = 'signup_code_input'
            code = signup_otp()
            stage = 'verify_signup'
            verified = auth.request('POST', '/verify', {'email': email, 'token': code, 'type': 'signup'})
            user_id(verified, email, expected, confirmed=True)
            stage = 'password_login'
            logged_in = auth.request('POST', '/token?grant_type=password', {'email': email, 'password': password})
            user_id(logged_in, email, expected, confirmed=True)
            bearer = access_token(logged_in, expected)
            stage = 'authenticated_user'
            current = auth.request('GET', '/user', bearer=bearer)
            user_id(current, email, expected, confirmed=True)
        print('{"status":"internal_auth_smoke_passed","signup_no_session":true,"signup_otp_verified":true,"password_login":true,"same_user":true,"new_test_account_retained":true,"app_account_sessions_verified":false,"credentials_printed":false}')
        return 0
    except SmokeError as error:
        reason = str(error)
    except (KeyboardInterrupt, EOFError):
        reason = 'interrupted'
    except getpass.GetPassWarning:
        reason = 'secure_input_required'
    except BaseException:
        reason = 'internal_auth_smoke_failed'
    unknown = stage == 'signup' and signup_started and not signup_accepted
    if unknown and reason in ('auth_request_timed_out', 'auth_transport_failed', 'interrupted'):
        reason = 'signup_outcome_unknown'
    print(json.dumps({'status': 'failed', 'stage': stage, 'reason': reason, 'signup_outcome_unknown': unknown, 'new_test_account_may_exist': signup_started, 'app_account_sessions_verified': False, 'credentials_printed': False}))
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
