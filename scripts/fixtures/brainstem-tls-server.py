"""Loopback-only TEST FIXTURE. No Brainstem runtime, CAN, robot, or account access.

Generated Python protobuf bindings provide an independent decoder for the actual
Android ControlSession's handwritten wire codec. Certificates are ephemeral.
This bounded fixture does not model the real lease clock, FSM/arbiter, sequence
gaps or idempotent duplicate replies; it cannot certify those production paths.
"""
import argparse
import datetime
import ipaddress
import json
import pathlib
import sys
import threading
from concurrent import futures

import grpc
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID


def prepare(folder):
    now = datetime.datetime.now(datetime.timezone.utc)

    def issue(name, issuer=None, server_ip=None, expired=False):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, name)])
        builder = (x509.CertificateBuilder().subject_name(subject)
                   .issuer_name(issuer[1].subject if issuer else subject)
                   .public_key(key.public_key()).serial_number(x509.random_serial_number())
                   .not_valid_before(now - datetime.timedelta(days=2) if expired else now - datetime.timedelta(minutes=1))
                   .not_valid_after(now - datetime.timedelta(days=1) if expired else now + datetime.timedelta(hours=1))
                   .add_extension(x509.BasicConstraints(ca=issuer is None, path_length=None), True))
        if issuer:
            builder = builder.add_extension(x509.ExtendedKeyUsage([
                ExtendedKeyUsageOID.SERVER_AUTH if server_ip else ExtendedKeyUsageOID.CLIENT_AUTH]), False)
        if server_ip:
            builder = builder.add_extension(x509.SubjectAlternativeName([
                x509.IPAddress(ipaddress.ip_address(server_ip))]), False)
        cert = builder.sign(issuer[0] if issuer else key, hashes.SHA256())
        return key, cert

    ca = issue('DOSO loopback fixture CA')
    rogue = issue('DOSO unrelated fixture CA')
    objects = {'ca': ca, 'rogue-ca': rogue,
               'server': issue('loopback', ca, '127.0.0.1'),
               'wrong-san': issue('loopback', ca, '127.0.0.2'),
               'client': issue('fixture-client@robot', ca),
               'expired-client': issue('fixture-client@robot', ca, expired=True),
               # Same issuer AND same CN deliberately do not establish the same identity.
               'unmapped': issue('fixture-client@robot', ca),
               'rogue-client': issue('fixture-client@robot', rogue)}
    for name, (key, cert) in objects.items():
        (folder / f'{name}.pem').write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        if name in ('server', 'wrong-san'):
            (folder / f'{name}.key').write_bytes(key.private_bytes(serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        if name in ('client', 'unmapped', 'rogue-client', 'expired-client'):
            (folder / f'{name}.p12').write_bytes(pkcs12.serialize_key_and_certificates(
                # Trust anchors are configured separately, not sent as client intermediates.
                name.encode(), key, cert, None,
                serialization.NoEncryption()))


def probe(folder, generated, port):
    """Independent generated-code client validates the fixture's negative oracle."""
    sys.path.insert(0, str(generated))
    from brainstem_api import cms_pb2 as pb, cms_pb2_grpc as api, common_pb2
    from google.protobuf.empty_pb2 import Empty
    key, certificate, _ = pkcs12.load_key_and_certificates((folder / 'client.p12').read_bytes(), None)
    credentials = grpc.ssl_channel_credentials(root_certificates=(folder / 'ca.pem').read_bytes(),
        private_key=key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption()), certificate_chain=certificate.public_bytes(serialization.Encoding.PEM))
    with grpc.secure_channel(f'127.0.0.1:{port}', credentials) as channel:
        stub = api.RobotControlStub(channel)
        assert stub.GetControlStatus(Empty(), timeout=3).fsm.kind == pb.CMS_STATE_KIND_STANDING
        assert stub.GetProfile(Empty(), timeout=3).current == 'fixture-standing'
        lease = stub.AcquireControl(pb.AcquireControlRequest(client_id='fixture-client@robot'), timeout=3)
        assert lease.accepted
        rejected = stub.WalkChecked(pb.WalkRequest(token=lease.token, sequence=17,
            direction=common_pb2.Vector3(x=.1)), timeout=3)
        assert not rejected.accepted and rejected.status.last_accepted_sequence == 0
        assert rejected.reason == pb.COMMAND_REJECT_REASON_CONTROL_BUSY
        assert rejected.status.grpc_lease_active
        accepted = stub.WalkChecked(pb.WalkRequest(token=lease.token, sequence=17,
            direction=common_pb2.Vector3()), timeout=3)
        assert accepted.accepted and accepted.sequence == 17
        missing = stub.WalkChecked(pb.WalkRequest(token=lease.token, sequence=18), timeout=3)
        assert not missing.accepted and missing.reason == pb.COMMAND_REJECT_REASON_INVALID_VECTOR
        assert not missing.status.grpc_lease_active
        lease = stub.AcquireControl(pb.AcquireControlRequest(client_id='fixture-client@robot'), timeout=3)
        assert lease.accepted
        assert not stub.ReleaseControl(pb.ControlLeaseRequest(token=lease.token), timeout=3).grpc_lease_active
    print('PASS: independent generated-code fixture contract (nonzero rejected, first positive sequence 17 accepted)')


def serve(folder, generated, scenario, ready, report):
    sys.path.insert(0, str(generated))
    from brainstem_api import cms_pb2 as pb, cms_pb2_grpc as api

    lock = threading.Lock()
    events = []
    active, sequence = False, 0
    allowed = x509.load_pem_x509_certificate((folder / 'client.pem').read_bytes()).fingerprint(hashes.SHA256())

    class Robot(api.RobotControlServicer):
        def status(self):
            return pb.ControlStatus(fsm=pb.CmsState(kind=pb.CMS_STATE_KIND_STANDING),
                motor_output_enabled=True, owner=pb.CONTROL_OWNER_GRPC if active else pb.CONTROL_OWNER_NONE,
                grpc_lease_active=active, lease_remaining_ms=1000 if active else 0,
                last_accepted_sequence=sequence, ready_for_walk=active,
                owner_id='fixture-client@robot' if active else '', accepted_count=sequence)

        def record(self, method, **fields):
            with lock:
                events.append({'method': method, **fields})

        def authorized(self, context, principal=None):
            raw = context.auth_context().get('x509_pem_cert', [b''])[0]
            fingerprint = x509.load_pem_x509_certificate(raw).fingerprint(hashes.SHA256()) if raw else b''
            if fingerprint != allowed or (principal is not None and principal != 'fixture-client@robot'):
                self.record('Denied', same_cn=True)
                context.abort(grpc.StatusCode.PERMISSION_DENIED, 'Fixture identity is not mapped')

        def GetControlStatus(self, request, context):
            self.record('GetControlStatus')
            return self.status()

        def GetProfile(self, request, context):
            self.record('GetProfile')
            return pb.ProfileInfo(current='fixture-standing', available=['fixture-standing', 'fixture-grounded'],
                descriptions=['Standing fixture', 'Grounded fixture'], current_description='Standing fixture')

        def AcquireControl(self, request, context):
            nonlocal active, sequence
            self.record('AcquireControl', principal=request.client_id)
            self.authorized(context, request.client_id)
            active, sequence = True, 0
            return pb.ControlLease(accepted=True, token='ephemeral-fixture-lease', lease_duration_ms=1000,
                status=self.status())

        def WalkChecked(self, request, context):
            nonlocal active, sequence
            self.authorized(context)
            vector = [request.direction.x, request.direction.y, request.direction.z]
            self.record('WalkChecked', sequence=request.sequence, vector=vector)
            if not active or request.token != 'ephemeral-fixture-lease':
                return pb.CommandAck(accepted=False, reason=pb.COMMAND_REJECT_REASON_LEASE_MISSING,
                    sequence=request.sequence, status=self.status())
            if not request.HasField('direction') or request.sequence <= sequence:
                active = False
                return pb.CommandAck(accepted=False, reason=pb.COMMAND_REJECT_REASON_INVALID_VECTOR,
                    sequence=request.sequence, status=self.status())
            if sequence == 0 and any(vector):
                return pb.CommandAck(accepted=False, reason=pb.COMMAND_REJECT_REASON_CONTROL_BUSY,
                    sequence=request.sequence, status=self.status())
            sequence = request.sequence
            if scenario == 'lost-ack' and sequence == 2:
                context.abort(grpc.StatusCode.UNAVAILABLE, 'Fixture dropped ACK')
            return pb.CommandAck(accepted=True, sequence=sequence, status=self.status())

        def ReleaseControl(self, request, context):
            nonlocal active
            self.record('ReleaseControl')
            self.authorized(context)
            if scenario == 'lost-release':
                context.abort(grpc.StatusCode.UNAVAILABLE, 'Fixture dropped release response')
            if request.token != 'ephemeral-fixture-lease':
                context.abort(grpc.StatusCode.FAILED_PRECONDITION, 'Unknown fixture lease')
            active = False
            return self.status()

    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    api.add_RobotControlServicer_to_server(Robot(), server)
    identity = 'wrong-san' if scenario == 'wrong-san' else 'server'
    credentials = grpc.ssl_server_credentials([((folder / f'{identity}.key').read_bytes(),
        (folder / f'{identity}.pem').read_bytes())], root_certificates=(folder / 'ca.pem').read_bytes(),
        require_client_auth=True)
    port = server.add_secure_port('127.0.0.1:0', credentials)
    if port <= 0:
        raise RuntimeError('Unable to bind fixture loopback port')
    server.start()
    ready.write_text(json.dumps({'host': '127.0.0.1', 'port': port}), encoding='utf-8')
    try:
        sys.stdin.readline()
    finally:
        server.stop(0).wait()
        report.write_text(json.dumps({'scenario': scenario, 'events': events, 'active': active,
            'lastSequence': sequence}), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['prepare', 'serve', 'probe'])
    parser.add_argument('folder', type=pathlib.Path)
    parser.add_argument('--generated', type=pathlib.Path)
    parser.add_argument('--scenario')
    parser.add_argument('--ready', type=pathlib.Path)
    parser.add_argument('--report', type=pathlib.Path)
    parser.add_argument('--port', type=int)
    args = parser.parse_args()
    if args.mode == 'prepare':
        prepare(args.folder)
    elif args.mode == 'probe':
        probe(args.folder, args.generated, args.port)
    else:
        serve(args.folder, args.generated, args.scenario, args.ready, args.report)
