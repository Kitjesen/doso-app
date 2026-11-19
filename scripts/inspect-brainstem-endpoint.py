"""Read-only inspection of the explicitly authorized, pinned Brainstem host."""
import base64
import getpass
import hashlib
import hmac
import json
import logging
import socket
from pathlib import Path

import paramiko

logging.disable(logging.CRITICAL)
HOST = "192.168.66.64"
EXPECTED = "SHA256:/xMCK5GjxUHfmhP0dMRIr5Y8XOvqsdwRe+8A72sL7gE"
known = paramiko.HostKeys(str(Path("C:/Users/99563/.ssh/known_hosts")))
trusted = known.lookup(HOST)
if not trusted or "ssh-ed25519" not in trusted:
    raise SystemExit("existing_host_trust_missing")
key = trusted["ssh-ed25519"]
fingerprint = "SHA256:" + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip("=")
if not hmac.compare_digest(fingerprint, EXPECTED):
    raise SystemExit("existing_host_trust_changed")
transport = paramiko.Transport(socket.create_connection((HOST, 22), timeout=5))
try:
    transport.get_security_options().key_types = ("ssh-ed25519",)
    transport.start_client(timeout=8)
    if not hmac.compare_digest(transport.get_remote_server_key().asbytes(), key.asbytes()):
        raise SystemExit("remote_host_key_changed")
    password = getpass.getpass("SSH_PASSWORD_INPUT_READY_NO_ECHO: ")
    transport.auth_password("sunrise", password, fallback=False)
    password = None
    commands = {
        "listener": "ss -lntpH '( sport = :13145 )'",
        "services": "systemctl is-active brainstem.service thunder-web.service; systemctl show brainstem.service -p FragmentPath -p ActiveState -p SubState -p MainPID; systemctl show thunder-web.service -p FragmentPath -p ActiveState -p SubState -p MainPID",
        "tls_file_presence": "for f in /etc/brainstem/tls/server.crt /etc/brainstem/tls/server.key /etc/brainstem/tls/brainstem-client-ca.crt /etc/brainstem/brainstem.env; do if test -e \"$f\"; then printf '%s present\\n' \"$f\"; else printf '%s absent\\n' \"$f\"; fi; done",
        "runtime_location": "for p in $(pgrep -x han_dog); do printf 'pid=%s cwd=' \"$p\"; readlink /proc/$p/cwd; printf 'exe='; readlink /proc/$p/exe; done",
        "listener_owners": "sudo -n ss -lntpH '( sport = :13145 )'",
        "runtime_files": "readlink /proc/1636/cwd; readlink /proc/1636/exe; systemctl list-units --type=service --all --no-pager --plain | grep -Ei 'brainstem|thunder|socat|grpc|stunnel'",
        "service_definition": "systemctl cat thunder-web.service | grep -E '^(WorkingDirectory|ExecStart|EnvironmentFile|User|Group)='",
        "proxy_definition": "systemctl cat brainstem-grpc-proxy.service | grep -E '^(ExecStart|EnvironmentFile|User|Group)='",
        "remote_security_config": "grep -E '^HAN_DOG_(GRPC_(ALLOWED_IPS|TLS_CERT_FILE|TLS_KEY_FILE|TLS_CLIENT_CA_FILE)|LOCOMOTION_PRINCIPALS)=' /home/sunrise/brainstem_mixed_can_stage_20261023_041903/han_dog/config/web_control.env",
    }
    for name, command in commands.items():
        channel = transport.open_session(timeout=5)
        channel.settimeout(8)
        try:
            channel.exec_command(command)
            output = channel.makefile("rb").read(8192).decode("utf-8", "replace")
            print(json.dumps({"check": name, "output": output, "exit": channel.recv_exit_status()}), flush=True)
        finally:
            channel.close()
finally:
    transport.close()
