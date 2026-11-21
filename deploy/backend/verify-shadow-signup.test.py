import base64
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('verify_shadow_signup', HERE / 'verify-shadow-signup.py')
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)
EMAIL = 'synthetic-new@example.test'
PASSWORD = 'SyntheticNew123!'
OTP = '123456'
USER = '01234567-89ab-4cde-8fab-0123456789ab'
OTHER = '11234567-89ab-4cde-8fab-0123456789ab'


def target(address='172.18.0.4'):
    return {'name': '/supabase-auth', 'labels': {'com.docker.compose.project': module.PROJECT, 'com.docker.compose.service': 'auth'}, 'image': module.IMAGE, 'running': True, 'health': 'healthy', 'networks': [{'name': module.NETWORK, 'ip': address}], 'otp_config': ['GOTRUE_MAILER_OTP_LENGTH=6']}


def user(confirmed=False, identifier=USER):
    value = {'id': identifier, 'email': EMAIL, 'email_confirmed_at': None, 'confirmed_at': None}
    if confirmed:
        value.update(email_confirmed_at='2026-10-27T05:45:00Z', confirmed_at='2026-10-27T05:45:00Z')
    return value


def token(claims=None, algorithm='ES256'):
    encode = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b'=').decode()
    payload = {'sub': USER, 'role': 'authenticated', 'aud': 'authenticated', 'exp': int(time.time()) + 3600}
    payload.update(claims or {})
    signature = base64.urlsafe_b64encode(b's' * (32 if algorithm == 'HS256' else 64)).rstrip(b'=').decode()
    return encode({'alg': algorithm, 'typ': 'JWT'}) + '.' + encode(payload) + '.' + signature


TOKEN = token()


def session(identifier=USER, access=TOKEN):
    return {'user': user(True, identifier), 'access_token': access, 'token_type': 'bearer', 'refresh_token': 'synthetic-refresh-must-not-print'}


class SignupSmokeTests(unittest.TestCase):
    def test_tty_requires_all_three_real_terminal_descriptors(self):
        for denied in (0, 1, 2):
            streams = [SimpleNamespace(isatty=lambda: True, fileno=lambda number=number: number) for number in range(3)]
            with patch.object(module.sys, 'stdin', streams[0]), patch.object(module.sys, 'stdout', streams[1]), patch.object(module.sys, 'stderr', streams[2]), patch.object(module.os, 'isatty', side_effect=lambda number: number != denied):
                with self.assertRaisesRegex(module.SmokeError, '^interactive_terminal_required$'):
                    module.require_terminal()

    def test_password_and_otp_use_getpass_without_echo_fallback(self):
        with patch.object(module, 'require_terminal'), patch.object(module.getpass, 'getpass', return_value=PASSWORD) as prompt:
            self.assertTrue(module.hidden('fixed hidden prompt: ') == PASSWORD)
            prompt.assert_called_once_with('fixed hidden prompt: ', stream=sys.stderr)
        def fallback(*args, **kwargs):
            module.warnings.warn('synthetic warning', module.getpass.GetPassWarning)
            self.fail('echo_fallback_must_not_read')
        with patch.object(module, 'require_terminal'), patch.object(module.getpass, 'getpass', side_effect=fallback):
            with self.assertRaises(module.getpass.GetPassWarning):
                module.hidden('fixed hidden prompt: ')

    def test_new_email_and_matching_password_are_validated_before_signup(self):
        with patch.object(module, 'require_terminal'), patch('builtins.input', return_value=' ' + EMAIL.upper() + ' '), patch.object(module, 'hidden', side_effect=[PASSWORD, PASSWORD]) as hidden:
            self.assertEqual(module.credentials(), (EMAIL, PASSWORD))
            self.assertEqual(hidden.call_count, 2)
        for password, confirmation in [('shortA1', 'shortA1'), ('lowercase123', 'lowercase123'), ('UPPERCASE123', 'UPPERCASE123'), ('NoNumbersHere', 'NoNumbersHere'), (PASSWORD, 'different'), ('A1a' + 'x' * 126, 'A1a' + 'x' * 126), ('A1a\n' + 'x' * 10, 'A1a\n' + 'x' * 10)]:
            with patch.object(module, 'require_terminal'), patch('builtins.input', return_value=EMAIL), patch.object(module, 'hidden', side_effect=[password, confirmation]):
                with self.assertRaises(module.SmokeError):
                    module.credentials()
        for email in ('not-email', 'x@localhost', 'x@@example.test', '.x@example.test', 'x..y@example.test', 'x@-example.test', 'x\r\nheader@example.test'):
            with patch.object(module, 'require_terminal'), patch('builtins.input', return_value=email), patch.object(module, 'hidden') as hidden:
                with self.assertRaisesRegex(module.SmokeError, '^invalid_test_email$'):
                    module.credentials()
                hidden.assert_not_called()

    def test_signup_code_is_exactly_six_ascii_digits_and_is_not_reprompted(self):
        for value in (OTP, '12345', '1234567', '12345678', '１２３４５６', ' 123456', '123456\n', 'abc123'):
            with patch.object(module, 'hidden', return_value=value) as hidden:
                if value == OTP:
                    self.assertEqual(module.signup_otp(), OTP)
                else:
                    with self.assertRaisesRegex(module.SmokeError, '^invalid_signup_code$'):
                        module.signup_otp()
                hidden.assert_called_once()

    def test_only_exact_new_auth_identity_and_single_default_network_are_accepted(self):
        self.assertEqual(module.target_address(target()), '172.18.0.4')
        changes = [lambda value: value.update(name='/old-auth'), lambda value: value['labels'].update({'com.docker.compose.project': 'old-project'}), lambda value: value['labels'].update({'com.docker.compose.service': 'db'}), lambda value: value.update(image='ghcr.io/supabase/gotrue:latest'), lambda value: value.update(running=False), lambda value: value.update(health='starting'), lambda value: value.update(labels=['invalid']), lambda value: value['networks'][0].update(name='old_default'), lambda value: value['networks'].append({'name': 'old_default', 'ip': '172.19.0.4'}), lambda value: value.update(networks=['invalid'])]
        for change in changes:
            record = target()
            change(record)
            with self.assertRaises(module.SmokeError):
                module.target_address(record)

    def test_only_canonical_rfc1918_ipv4_addresses_can_receive_requests(self):
        for address in ('10.5.6.7', '172.16.0.1', '172.31.255.254', '192.168.4.5'):
            self.assertEqual(module.target_address(target(address)), address)
        for address in ('8.8.8.8', '127.0.0.1', '169.254.169.254', '172.32.0.1', '192.0.0.1', '0.0.0.0', '::1', 'auth', 'https://example.test', '172.018.0.4', 2886860804):
            with self.assertRaisesRegex(module.SmokeError, '^private_auth_ip_required$'):
                module.target_address(target(address))

    def test_docker_reads_only_narrow_fields_using_private_empty_config_and_local_socket(self):
        result = SimpleNamespace(returncode=0, stdout=json.dumps(target()).encode(), stderr=b'synthetic private diagnostic')
        with patch.dict(os.environ, {'DOCKER_HOST': 'tcp://external.test:2375', 'SUPABASE_URL': 'https://external.test', 'SMTP_PASS': PASSWORD}), patch.object(module.subprocess, 'run', return_value=result) as run:
            docker = module.Docker('/run/synthetic-private')
            self.assertEqual(docker.inspect(), target())
        command = run.call_args.args[0]
        self.assertEqual(command[:5], ['/usr/bin/docker', '--config', '/run/synthetic-private', '--host', 'unix:///var/run/docker.sock'])
        self.assertEqual(command[5:9], ['container', 'inspect', 'supabase-auth', '--format'])
        self.assertNotIn('json .Config.Env', command[-1])
        self.assertIn('eq (index (split . "=") 0) "GOTRUE_MAILER_OTP_LENGTH"', command[-1])
        self.assertNotIn('json .NetworkSettings.Networks', command[-1])
        self.assertIn('json $network.IPAddress', command[-1])
        self.assertEqual(run.call_args.kwargs['timeout'], 20)
        self.assertEqual(run.call_args.kwargs['stdin'], subprocess.DEVNULL)
        self.assertTrue(run.call_args.kwargs['capture_output'])
        self.assertEqual(set(docker.environment), {'PATH', 'HOME', 'DOCKER_CONFIG', 'LANG', 'LC_ALL'})
        self.assertNotIn(PASSWORD, json.dumps(command) + json.dumps(docker.environment))

    def test_docker_failures_never_return_remote_diagnostics(self):
        for error in (subprocess.TimeoutExpired('fixed command', 20, output=PASSWORD.encode()), OSError(PASSWORD)):
            with patch.object(module.subprocess, 'run', side_effect=error):
                with self.assertRaisesRegex(module.SmokeError, '^auth_inspection_failed$'):
                    module.Docker('/run/synthetic-private').inspect()
        for result in (SimpleNamespace(returncode=1, stdout=PASSWORD.encode()), SimpleNamespace(returncode=0, stdout=b'not json'), SimpleNamespace(returncode=0, stdout=b'[]')):
            with patch.object(module.subprocess, 'run', return_value=result):
                with self.assertRaisesRegex(module.SmokeError, '^auth_inspection_failed$'):
                    module.Docker('/run/synthetic-private').inspect()

    def http(self, payload=None, status=200, content_type='application/json', error=None):
        docker = MagicMock()
        docker.inspect.return_value = target()
        auth = module.Auth(docker)
        connection = MagicMock()
        response = connection.getresponse.return_value
        response.status = status
        response.getheader.side_effect = lambda name: content_type if name == 'Content-Type' else None
        response.read.return_value = json.dumps(payload or user()).encode()
        connection.request.side_effect = error
        return auth, docker, connection, response

    def http_patches(self, stack, connection):
        connect = stack.enter_context(patch.object(module.http.client, 'HTTPConnection', return_value=connection))
        stack.enter_context(patch.object(module.signal, 'SIGALRM', 14, create=True))
        handler = stack.enter_context(patch.object(module.signal, 'signal', return_value='old-handler'))
        alarm = stack.enter_context(patch.object(module.signal, 'alarm', create=True))
        return connect, handler, alarm

    def test_http_is_fixed_private_port_direct_without_proxy_apikey_redirect_or_retry(self):
        auth, docker, connection, response = self.http()
        with contextlib.ExitStack() as stack:
            connect, handler, alarm = self.http_patches(stack, connection)
            stack.enter_context(patch.dict(os.environ, {'HTTP_PROXY': 'http://external.test', 'ALL_PROXY': 'http://external.test'}))
            reply = auth.request('POST', '/signup', {'email': EMAIL, 'password': PASSWORD})
        self.assertEqual(reply['id'], USER)
        connect.assert_called_once_with('172.18.0.4', 9999, timeout=20)
        self.assertEqual(docker.inspect.call_count, 2)
        args, options = connection.request.call_args
        self.assertEqual(args, ('POST', '/signup'))
        self.assertEqual(json.loads(options['body']), {'email': EMAIL, 'password': PASSWORD})
        self.assertFalse(any(name.lower() in ('authorization', 'apikey') for name in options['headers']))
        response.read.assert_called_once_with(module.LIMIT + 1)
        self.assertEqual([call.args[0] for call in alarm.call_args_list], [20, 0])
        self.assertEqual(handler.call_args.args, (14, 'old-handler'))
        connection.close.assert_called_once()

    def test_changed_docker_target_blocks_http_even_after_user_waits_for_email(self):
        docker = MagicMock()
        docker.inspect.side_effect = [target('172.18.0.4'), target('172.18.0.5')]
        auth = module.Auth(docker)
        with patch.object(module.http.client, 'HTTPConnection') as connect:
            with self.assertRaisesRegex(module.SmokeError, '^auth_target_changed$'):
                auth.request('POST', '/verify', {'email': EMAIL, 'token': OTP, 'type': 'signup'})
            connect.assert_not_called()

    def test_otp_configuration_drift_blocks_each_request_before_http(self):
        docker = MagicMock()
        changed = target()
        changed['otp_config'] = ['GOTRUE_MAILER_OTP_LENGTH=8']
        docker.inspect.side_effect = [target(), changed]
        auth = module.Auth(docker)
        with patch.object(module.http.client, 'HTTPConnection') as connect:
            with self.assertRaisesRegex(module.SmokeError, '^six_digit_auth_required$'):
                auth.request('POST', '/verify', {'email': EMAIL, 'token': OTP, 'type': 'signup'})
            connect.assert_not_called()

    def test_user_lookup_places_only_the_validated_bearer_in_the_authorization_header(self):
        auth, _, connection, _ = self.http(user(True))
        with contextlib.ExitStack() as stack:
            self.http_patches(stack, connection)
            auth.request('GET', '/user', bearer=TOKEN)
        args, options = connection.request.call_args
        self.assertEqual(args, ('GET', '/user'))
        self.assertIsNone(options['body'])
        self.assertEqual(options['headers']['Authorization'], 'Bearer ' + TOKEN)
        self.assertNotIn('apikey', options['headers'])

    def test_unapproved_route_and_bearer_header_injection_are_rejected_without_http(self):
        for method, route, bearer in [('POST', '/logout', None), ('DELETE', '/user', None), ('POST', 'https://external.test/signup', None), ('GET', '/user', TOKEN + '\r\nInjected: value')]:
            auth, _, _, _ = self.http()
            with patch.object(module.http.client, 'HTTPConnection') as connect:
                with self.assertRaises(module.SmokeError):
                    auth.request(method, route, bearer=bearer)
                connect.assert_not_called()

    def test_redirects_errors_and_non_json_responses_never_follow_or_reveal_bodies(self):
        for status, content_type, reason in [(302, 'application/json', 'auth_request_rejected'), (401, 'application/json', 'auth_request_rejected'), (500, 'application/json', 'auth_request_rejected'), (200, 'text/html', 'invalid_auth_response')]:
            auth, _, connection, _ = self.http(status=status, content_type=content_type)
            with contextlib.ExitStack() as stack:
                self.http_patches(stack, connection)
                with self.assertRaisesRegex(module.SmokeError, '^' + reason + '$'):
                    auth.request('POST', '/signup', {'email': EMAIL, 'password': PASSWORD})
            connection.request.assert_called_once()
            connection.close.assert_called_once()

    def test_response_limit_invalid_json_and_non_object_payload_are_rejected(self):
        for body, reason in [(b'x' * (module.LIMIT + 1), 'auth_response_too_large'), (PASSWORD.encode(), 'invalid_auth_response'), (b'[]', 'invalid_auth_response')]:
            auth, _, connection, response = self.http()
            response.read.return_value = body
            with contextlib.ExitStack() as stack:
                self.http_patches(stack, connection)
                with self.assertRaisesRegex(module.SmokeError, '^' + reason + '$'):
                    auth.request('POST', '/signup', {'email': EMAIL, 'password': PASSWORD})

    def test_timeout_and_transport_exceptions_are_fixed_and_close_without_retry(self):
        for error, reason in [(TimeoutError(PASSWORD), 'auth_request_timed_out'), (module.http.client.BadStatusLine(TOKEN), 'auth_transport_failed'), (OSError(EMAIL), 'auth_transport_failed')]:
            auth, _, connection, _ = self.http(error=error)
            output = io.StringIO()
            with contextlib.ExitStack() as stack:
                self.http_patches(stack, connection)
                stack.enter_context(contextlib.redirect_stdout(output))
                stack.enter_context(contextlib.redirect_stderr(output))
                with self.assertRaisesRegex(module.SmokeError, '^' + reason + '$'):
                    auth.request('POST', '/signup', {'email': EMAIL, 'password': PASSWORD})
            self.assertEqual(output.getvalue(), '')
            connection.request.assert_called_once()
            connection.close.assert_called_once()

    def test_total_http_deadline_covers_headers_and_body_and_restores_the_handler(self):
        auth, _, connection, _ = self.http()
        with contextlib.ExitStack() as stack:
            _, handler, alarm = self.http_patches(stack, connection)
            connection.request.side_effect = lambda *args, **kwargs: handler.call_args.args[1](14, None)
            with self.assertRaisesRegex(module.SmokeError, '^auth_request_timed_out$'):
                auth.request('POST', '/signup', {'email': EMAIL, 'password': PASSWORD})
            self.assertEqual(handler.call_args.args, (14, 'old-handler'))
            self.assertEqual(alarm.call_args.args, (0,))

    def test_signup_accepts_raw_or_wrapped_user_but_never_a_session_or_confirmed_user(self):
        self.assertEqual(module.signup_user(user(), EMAIL), USER)
        self.assertEqual(module.signup_user({'user': user(), 'session': None}, EMAIL), USER)
        for reply in [session(), {'user': user(), 'session': {}}, {'user': user(), 'access_token': TOKEN}, user(True), {'id': 'invalid', 'email': EMAIL}]:
            with self.assertRaises(module.SmokeError):
                module.signup_user(reply, EMAIL)

    def test_confirmed_user_must_match_the_signup_uuid_and_email(self):
        self.assertEqual(module.user_id({'user': user(True)}, EMAIL, USER, confirmed=True), USER)
        alias = user()
        alias['confirmed_at'] = '2026-10-27T05:45:00Z'
        self.assertEqual(module.user_id(alias, EMAIL, USER, confirmed=True), USER)
        for reply in [user(), user(True, OTHER), {'id': USER, 'email': 'different@example.test', 'confirmed_at': '2026-10-27T05:45:00Z'}]:
            with self.assertRaises(module.SmokeError):
                module.user_id(reply, EMAIL, USER, confirmed=True)

    def test_login_token_is_bearer_canonical_jwt_for_the_same_nonexpired_authenticated_user(self):
        self.assertEqual(module.access_token(session(), USER), TOKEN)
        for value in [session(access='short'), session(access=TOKEN + '\n'), session(access=token({'sub': OTHER})), session(access=token({'exp': 1})), session(access=token({'exp': True})), session(access=token({'role': 'service_role'})), session(access=token({'aud': 'other'})), session(access=token(algorithm='none')), dict(session(), token_type='basic')]:
            with self.assertRaises(module.SmokeError):
                module.access_token(value, USER)
        legacy = token({'aud': ['authenticated']}, algorithm='HS256')
        self.assertEqual(module.access_token(session(access=legacy), USER), legacy)

    def mocked_main(self, failure=None):
        auth = MagicMock()
        replies = [user(), session(), session(), user(True)]
        if failure == 'timeout':
            auth.request.side_effect = module.SmokeError('auth_request_timed_out')
        elif failure == 'private_error':
            auth.request.side_effect = RuntimeError(EMAIL + PASSWORD + OTP + TOKEN)
        else:
            if failure == 'verify_user':
                replies[1] = session(OTHER)
            if failure == 'token_user':
                replies[2] = session(access=token({'sub': OTHER}))
            if failure == 'current_user':
                replies[3] = user(True, OTHER)
            auth.request.side_effect = replies
        resource = SimpleNamespace(RLIMIT_CORE=4, setrlimit=MagicMock())
        output = io.StringIO()
        with patch.object(module.sys, 'platform', 'linux'), patch.object(module.os, 'geteuid', return_value=0, create=True), patch.object(module, 'require_terminal'), patch.dict(sys.modules, {'resource': resource}), patch.object(module.os, 'umask'), patch.object(module.tempfile, 'TemporaryDirectory', return_value=contextlib.nullcontext('/run/synthetic-private')), patch.object(module.os, 'chmod'), patch.object(module.os, 'listdir', return_value=[]), patch.object(module, 'Docker'), patch.object(module, 'Auth', return_value=auth), patch.object(module, 'credentials', return_value=(EMAIL, PASSWORD)), patch.object(module, 'signup_otp', return_value=OTP) as otp, contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            code = module.main([])
        return code, auth, otp, output.getvalue()

    def test_mocked_full_flow_has_exactly_four_native_requests_and_no_persistent_session_actions(self):
        code, auth, otp, output = self.mocked_main()
        self.assertEqual(code, 0)
        calls = auth.request.call_args_list
        self.assertEqual([call.args[:2] for call in calls], [('POST', '/signup'), ('POST', '/verify'), ('POST', '/token?grant_type=password'), ('GET', '/user')])
        self.assertEqual(calls[1].args[2], {'email': EMAIL, 'token': OTP, 'type': 'signup'})
        self.assertEqual(calls[3].kwargs, {'bearer': TOKEN})
        otp.assert_called_once()
        result = json.loads(output.splitlines()[-1])
        self.assertTrue(result['new_test_account_retained'])
        self.assertFalse(result['app_account_sessions_verified'])
        for value in (EMAIL, PASSWORD, OTP, TOKEN, USER, 'synthetic-refresh-must-not-print'):
            self.assertNotIn(value, output)

    def test_signup_timeout_is_outcome_unknown_and_never_repeated_or_resent(self):
        code, auth, otp, output = self.mocked_main('timeout')
        self.assertEqual(code, 1)
        auth.request.assert_called_once()
        otp.assert_not_called()
        result = json.loads(output.splitlines()[-1])
        self.assertEqual(result['stage'], 'signup')
        self.assertEqual(result['reason'], 'signup_outcome_unknown')
        self.assertTrue(result['signup_outcome_unknown'])
        self.assertTrue(result['new_test_account_may_exist'])

    def test_wrong_verification_login_token_or_current_user_stops_without_logout_delete_or_retry(self):
        for failure, count, stage in [('verify_user', 2, 'verify_signup'), ('token_user', 3, 'password_login'), ('current_user', 4, 'authenticated_user')]:
            code, auth, _, output = self.mocked_main(failure)
            self.assertEqual(code, 1)
            self.assertEqual(auth.request.call_count, count)
            self.assertEqual(json.loads(output.splitlines()[-1])['stage'], stage)
            for value in (EMAIL, PASSWORD, OTP, TOKEN, USER, OTHER):
                self.assertNotIn(value, output)

    def test_unexpected_failure_never_prints_sensitive_exception_text(self):
        code, auth, _, output = self.mocked_main('private_error')
        self.assertEqual(code, 1)
        auth.request.assert_called_once()
        self.assertEqual(json.loads(output.splitlines()[-1])['reason'], 'internal_auth_smoke_failed')
        for value in (EMAIL, PASSWORD, OTP, TOKEN):
            self.assertNotIn(value, output)

    def test_mocked_main_rejects_arguments_and_non_tty_without_echoing_or_touching_docker(self):
        output = io.StringIO()
        with patch.object(module, 'Docker') as docker, contextlib.redirect_stdout(output):
            self.assertEqual(module.main([PASSWORD]), 1)
            docker.assert_not_called()
        self.assertNotIn(PASSWORD, output.getvalue())
        output = io.StringIO()
        with patch.object(module.sys, 'platform', 'linux'), patch.object(module.os, 'geteuid', return_value=0, create=True), patch.object(module, 'require_terminal', side_effect=module.SmokeError('interactive_terminal_required')), patch.object(module, 'Docker') as docker, contextlib.redirect_stdout(output):
            self.assertEqual(module.main([]), 1)
            docker.assert_not_called()
        self.assertEqual(json.loads(output.getvalue())['reason'], 'interactive_terminal_required')

    def test_eight_digit_or_missing_otp_config_stops_before_input_or_signup(self):
        for configuration in (['GOTRUE_MAILER_OTP_LENGTH=8'], None, ['GOTRUE_MAILER_OTP_LENGTH=6', 'GOTRUE_MAILER_OTP_LENGTH=8']):
            record = target()
            if configuration is None:
                del record['otp_config']
            else:
                record['otp_config'] = configuration
            docker = MagicMock()
            docker.inspect.return_value = record
            output = io.StringIO()
            resource = SimpleNamespace(RLIMIT_CORE=4, setrlimit=MagicMock())
            with patch.object(module.sys, 'platform', 'linux'), patch.object(module.os, 'geteuid', return_value=0, create=True), patch.object(module, 'require_terminal'), patch.dict(sys.modules, {'resource': resource}), patch.object(module.os, 'umask'), patch.object(module.tempfile, 'TemporaryDirectory', return_value=contextlib.nullcontext('/run/synthetic-private')), patch.object(module.os, 'chmod'), patch.object(module.os, 'listdir', return_value=[]), patch.object(module, 'Docker', return_value=docker), patch.object(module, 'credentials') as entered, patch.object(module.http.client, 'HTTPConnection') as http, contextlib.redirect_stdout(output):
                self.assertEqual(module.main([]), 1)
            entered.assert_not_called()
            http.assert_not_called()
            result = json.loads(output.getvalue())
            self.assertEqual(result['reason'], 'six_digit_auth_required')
            self.assertEqual(result['stage'], 'preflight')
            self.assertFalse(result['new_test_account_may_exist'])


if __name__ == '__main__':
    unittest.main()
