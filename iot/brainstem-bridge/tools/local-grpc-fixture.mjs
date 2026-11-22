import http2 from 'node:http2';
import tls from 'node:tls';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const forge = require('node-forge');
const protobuf = require('protobufjs');
export const DEFAULT_PROTO_PATH = 'D:/inovxio/brain/brainstem/brainstem_api/brainstem_api/cms.proto';
export const SERVICE = 'brainstem.api.v1.RobotControl';
export const STATUS_PATH = `/${SERVICE}/GetControlStatus`;
export const MAX_MESSAGE_BYTES = 64 * 1024;
export const GRPC = Object.freeze({ OK: 0, INVALID_ARGUMENT: 3, DEADLINE_EXCEEDED: 4, PERMISSION_DENIED: 7, RESOURCE_EXHAUSTED: 8, UNIMPLEMENTED: 12 });
const fingerprint = (raw) => createHash('sha256').update(raw).digest('hex');

export async function loadProtocol(protoPath = DEFAULT_PROTO_PATH) {
  const absolute = path.resolve(protoPath);
  const root = new protobuf.Root();
  const defaultResolve = root.resolvePath;
  root.resolvePath = (origin, target) => target.startsWith('brainstem_api/')
    ? path.join(path.dirname(absolute), target.slice('brainstem_api/'.length))
    : defaultResolve.call(root, origin, target);
  await root.load(absolute);
  root.resolveAll();
  return {
    root,
    statusType: root.lookupType('brainstem.api.v1.ControlStatus'),
    emptyType: root.lookupType('google.protobuf.Empty'),
    methods: new Set(Object.keys(root.lookupService(SERVICE).methods)),
  };
}

function makeCertificates() {
  function issue(name, issuer, usage) {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const cert = forge.pki.createCertificate();
    cert.publicKey = forge.pki.publicKeyFromPem(publicKey);
    cert.serialNumber = `01${randomBytes(16).toString('hex')}`;
    cert.validity.notBefore = new Date(Date.now() - 60_000);
    cert.validity.notAfter = new Date(Date.now() + 3_600_000);
    cert.setSubject([{ name: 'commonName', value: name }]);
    cert.setIssuer(issuer ? issuer.certificate.subject.attributes : cert.subject.attributes);
    const extensions = [
      { name: 'basicConstraints', critical: true, cA: usage === 'ca' },
      { name: 'keyUsage', critical: true, digitalSignature: true, keyEncipherment: usage === 'server', keyCertSign: usage === 'ca', cRLSign: usage === 'ca' },
    ];
    if (usage !== 'ca') extensions.push({ name: 'extKeyUsage', serverAuth: usage === 'server', clientAuth: usage === 'client' });
    if (usage === 'server') extensions.push({ name: 'subjectAltName', altNames: [{ type: 7, ip: '127.0.0.1' }] });
    cert.setExtensions(extensions);
    cert.sign(forge.pki.privateKeyFromPem(issuer ? issuer.key : privateKey), forge.md.sha256.create());
    return { certificate: cert, cert: forge.pki.certificateToPem(cert), key: privateKey };
  }
  const ca = issue('DOSO SIMULATION temporary CA', null, 'ca');
  const server = issue('DOSO SIMULATION loopback', ca, 'server');
  const observer = issue('observer', ca, 'client');
  // Deliberately use the same CN: authorization must pin the exact leaf, not its name.
  const unauthorized = issue('observer', ca, 'client');
  const wrongCa = issue('DOSO SIMULATION unrelated CA', null, 'ca');
  const wrongClient = issue('observer', wrongCa, 'client');
  const observerDer = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(observer.certificate)).getBytes(), 'binary');
  return { ca, server, observer, unauthorized, wrongCa, wrongClient, observerFingerprint: fingerprint(observerDer) };
}

export function frameMessage(payload = Buffer.alloc(0)) {
  const body = Buffer.from(payload);
  const frame = Buffer.alloc(5 + body.length);
  frame.writeUInt32BE(body.length, 1);
  body.copy(frame, 5);
  return frame;
}

export function unframeMessage(frame) {
  if (frame.length < 5 || frame[0] !== 0 || frame.readUInt32BE(1) !== frame.length - 5) throw new Error('Expected one uncompressed gRPC message');
  if (frame.length - 5 > MAX_MESSAGE_BYTES) throw new Error('gRPC message exceeds 64 KiB');
  return frame.subarray(5);
}

/** Protocol fixture only. No robot, CAN, control state machine, or network backend. */
export async function createLocalGrpcFixture({ protoPath = DEFAULT_PROTO_PATH, timeoutMs = 2_000, testOnly = false, ...extra } = {}) {
  if (Object.keys(extra).length) throw new Error('Fixture has no configurable bind address or port');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 10_000) throw new Error('timeoutMs must be between 50 and 10000');
  const protocol = await loadProtocol(protoPath);
  const material = makeCertificates();
  const status = protocol.statusType.fromObject({
    fsm: { kind: 'CMS_STATE_KIND_GROUNDED', transition: 'CMS_TRANSITION_KIND_NONE', gestureName: '' },
    motorOutputEnabled: false, owner: 'CONTROL_OWNER_NONE', criticalMotorFault: false,
    grpcLeaseActive: false, leaseRemainingMs: 0, lastAcceptedSequence: 0,
    lastDecision: 'COMMAND_REJECT_REASON_NONE', readyForWalk: false,
    ownerId: 'SIMULATION', acceptedCount: 0, rejectedCount: 0,
  });
  const responseBytes = protocol.statusType.encode(status).finish();
  const sessions = new Set();
  const sockets = new Set();
  const server = http2.createSecureServer({
    key: material.server.key, cert: material.server.cert, ca: material.ca.cert,
    requestCert: true, rejectUnauthorized: true, allowHTTP1: false,
    minVersion: 'TLSv1.2', handshakeTimeout: timeoutMs,
    settings: { maxConcurrentStreams: 16, maxHeaderListSize: 8192 },
  });
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.on('tlsClientError', () => {});
  server.on('session', (session) => {
    sessions.add(session);
    session.on('error', () => {});
    session.on('close', () => sessions.delete(session));
    session.setTimeout(timeoutMs * 2, () => session.destroy());
  });
  server.on('stream', (stream, headers) => {
    stream.on('error', () => {});
    let done = false;
    const timer = setTimeout(() => finish(GRPC.DEADLINE_EXCEEDED, 'SIMULATION request timed out'), timeoutMs);
    stream.on('close', () => clearTimeout(timer));
    function finish(code, message, payload) {
      if (done || stream.destroyed || stream.closed) return;
      done = true;
      clearTimeout(timer);
      stream.respond({ ':status': 200, 'content-type': 'application/grpc+proto', 'x-doso-simulation': 'true' }, { waitForTrailers: true });
      stream.on('wantTrailers', () => {
        if (!stream.destroyed) stream.sendTrailers({ 'grpc-status': String(code), 'grpc-message': encodeURIComponent(message) });
      });
      stream.end(payload ? frameMessage(payload) : undefined);
    }
    const peer = stream.session.socket.getPeerCertificate();
    if (!stream.session.socket.authorized || !peer.raw || fingerprint(peer.raw) !== material.observerFingerprint) {
      finish(GRPC.PERMISSION_DENIED, 'SIMULATION requires the exact observer certificate');
      stream.resume();
      return;
    }
    const method = String(headers[':path']).replace(`/${SERVICE}/`, '');
    if (headers[':path'] !== `/${SERVICE}/${method}` || !protocol.methods.has(method)) {
      finish(GRPC.UNIMPLEMENTED, 'SIMULATION unknown method'); stream.resume(); return;
    }
    if (headers[':path'] !== STATUS_PATH) {
      finish(GRPC.PERMISSION_DENIED, 'SIMULATION is status-only; all other methods are denied'); stream.resume(); return;
    }
    if (headers[':method'] !== 'POST' || !/^application\/grpc(?:\+proto)?$/.test(String(headers['content-type'])) || ![undefined, 'identity'].includes(headers['grpc-encoding'])) {
      finish(GRPC.INVALID_ARGUMENT, 'SIMULATION requires uncompressed protobuf gRPC POST'); stream.resume(); return;
    }
    let size = 0;
    const chunks = [];
    stream.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > MAX_MESSAGE_BYTES + 5) { finish(GRPC.RESOURCE_EXHAUSTED, 'SIMULATION message exceeds 64 KiB'); return; }
      chunks.push(chunk);
      const prefix = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, size);
      if (prefix.length >= 5 && prefix.readUInt32BE(1) > MAX_MESSAGE_BYTES) finish(GRPC.RESOURCE_EXHAUSTED, 'SIMULATION message exceeds 64 KiB');
    });
    stream.on('end', () => {
      if (done) return;
      try {
        const payload = unframeMessage(Buffer.concat(chunks, size));
        protocol.emptyType.decode(payload);
        // A strict Empty request prevents unknown protobuf fields being silently ignored.
        if (payload.length !== 0) throw new Error('Empty request has data');
        finish(GRPC.OK, 'SIMULATION fixed status', responseBytes);
      } catch { finish(GRPC.INVALID_ARGUMENT, 'SIMULATION requires exactly one empty protobuf request'); }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  let closing;
  const fixture = {
    simulation: true, host: '127.0.0.1', port: server.address().port,
    origin: `https://127.0.0.1:${server.address().port}`, protocol,
    async close() {
      closing ??= new Promise((resolve) => {
        server.close(resolve);
        for (const session of sessions) session.destroy();
        for (const socket of sockets) socket.destroy();
      });
      await closing;
    },
  };
  if (testOnly) fixture.credentials = {
    ca: material.ca.cert,
    observer: { cert: material.observer.cert, key: material.observer.key },
    unauthorized: { cert: material.unauthorized.cert, key: material.unauthorized.key },
    wrongCa: material.wrongCa.cert,
    wrongClient: { cert: material.wrongClient.cert, key: material.wrongClient.key },
  };
  return fixture;
}

/** Uses normal chain + IP SAN verification; credentials never leave process memory. */
export function requestLocalGrpc({ origin, ca, cert, key, rpcPath = STATUS_PATH, body = frameMessage(), timeoutMs = 3_000 }) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.pathname !== '/') throw new Error('Client is restricted to https://127.0.0.1:<port>');
  return new Promise((resolve, reject) => {
    let settled = false;
    let session;
    const socket = tls.connect({
      host: '127.0.0.1', port: Number(url.port), ca, cert, key,
      rejectUnauthorized: true, minVersion: 'TLSv1.2', ALPNProtocols: ['h2'],
      checkServerIdentity: (_hostname, peer) => tls.checkServerIdentity('127.0.0.1', peer),
    });
    const timer = setTimeout(() => finish(new Error('SIMULATION client timeout')), timeoutMs);
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      session?.destroy();
      socket.destroy();
      if (error) reject(error); else resolve(value);
    }
    socket.on('error', (error) => finish(error));
    session = http2.connect(url.origin, { createConnection: () => socket });
    session.on('error', (error) => finish(error));
    session.on('close', () => { if (!settled) finish(new Error('SIMULATION connection closed before response')); });
    const request = session.request({ ':path': rpcPath, ':method': 'POST', 'content-type': 'application/grpc+proto', te: 'trailers' });
    const chunks = [];
    let length = 0;
    let headers;
    let trailers;
    request.on('response', (value) => { headers = value; });
    request.on('trailers', (value) => { trailers = value; });
    request.on('error', (error) => finish(error));
    request.on('data', (chunk) => {
      length += chunk.length;
      if (length > MAX_MESSAGE_BYTES + 5) { finish(new Error('SIMULATION oversized response')); return; }
      chunks.push(chunk);
    });
    request.on('end', () => {
      const statusCode = Number(trailers?.['grpc-status'] ?? headers?.['grpc-status']);
      if (!Number.isInteger(statusCode)) { finish(new Error('SIMULATION response lacks grpc-status')); return; }
      finish(null, { simulation: headers?.['x-doso-simulation'] === 'true', statusCode, headers, trailers, body: Buffer.concat(chunks, length) });
    });
    request.end(body);
  });
}

export async function runLocalGrpcSimulation() {
  const fixture = await createLocalGrpcFixture({ testOnly: true });
  try {
    const result = await requestLocalGrpc({ origin: fixture.origin, ca: fixture.credentials.ca, ...fixture.credentials.observer });
    if (result.statusCode !== GRPC.OK || !result.simulation) throw new Error('SIMULATION status request failed');
    return {
      simulation: true, verification: 'TLS + HTTP/2 + mTLS + real protobuf status-only fixture',
      grpcStatus: result.statusCode,
      status: fixture.protocol.statusType.toObject(fixture.protocol.statusType.decode(unframeMessage(result.body)), { enums: String, longs: String, defaults: true }),
      limitation: 'Not the Dart FSM, robot hardware, CAN, or G20 App end-to-end verification',
    };
  } finally { await fixture.close(); }
}

/** PC receiver simulation only; no robot connection, FSM, CAN, or forwarding. */
export async function createLocalControlFixture({ protoPath = DEFAULT_PROTO_PATH, leaseDurationMs = 300, maxRecords = 5_000, ...extra } = {}) {
  if (Object.keys(extra).length) throw new Error('Fixture has no configurable bind address or port');
  if (!Number.isInteger(leaseDurationMs) || leaseDurationMs < 50 || leaseDurationMs > 10_000) throw new Error('Invalid leaseDurationMs');
  if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 100_000) throw new Error('Invalid maxRecords');
  const grpc = require('@grpc/grpc-js');
  const protocol = await loadProtocol(protoPath);
  const service = protocol.root.lookupService(SERVICE);
  const reasons = protocol.root.lookupEnum('brainstem.api.v1.CommandRejectReason').values;
  const rpcCounts = Object.fromEntries(Object.keys(service.methods).map((name) => [name, 0]));
  const countRpc = (name) => { rpcCounts[name] = Math.min(Number.MAX_SAFE_INTEGER, rpcCounts[name] + 1); };
  const reason = (name) => reasons[`COMMAND_REJECT_REASON_${name}`];
  const started = performance.now();
  const records = [];
  const intervals = [];
  let received = 0, accepted = 0, rejected = 0, lastReceived = null, firstReceived = null;
  let acceptedCommands = 0;
  let token = '', principal = '', expires = 0, leaseTimer, lastSequence = '0', lastPayload = '', lastWalkAt = null;
  let enabled = false, standing = false, initialZero = false, moving = false, decision = 0;
  let stopCount = 0, lastStop = null, fault = {};
  const now = () => performance.now() - started;
  function revoke(why) {
    if (token) { stopCount++; lastStop = { monoMs: now(), reason: why }; }
    clearTimeout(leaseTimer);
    token = ''; principal = ''; expires = 0; moving = false;
    lastSequence = '0'; lastPayload = ''; initialZero = false;
    decision = why;
  }
  function renew() {
    clearTimeout(leaseTimer);
    expires = now() + leaseDurationMs;
    leaseTimer = setTimeout(() => revoke(reason('LEASE_EXPIRED')), leaseDurationMs);
  }
  function status() {
    if (token && now() >= expires) revoke(reason('LEASE_EXPIRED'));
    return { fsm: { kind: moving ? 3 : standing ? 2 : 1, transition: 0 }, motorOutputEnabled: enabled,
      owner: token ? 1 : 0, grpcLeaseActive: !!token, leaseRemainingMs: Math.max(0, Math.floor(expires - now())),
      lastAcceptedSequence: lastSequence, lastDecision: decision, readyForWalk: enabled && standing,
      ownerId: token ? principal : 'SIMULATION', acceptedCount: acceptedCommands, rejectedCount: rejected };
  }
  const precondition = () => !enabled ? reason('MOTORS_DISABLED') : !standing ? reason('FSM_NOT_READY') : 0;
  function leaseReply(ok, why = 0) {
    decision = why;
    return { accepted: ok, token: ok ? token : '', leaseDurationMs, reason: why, status: status() };
  }
  function validToken(value) { status(); return !!token && value === token; }
  const handlers = {
    GetControlStatus: () => status(),
    GetProfile: () => ({ current: 'SIMULATION', available: ['SIMULATION'], currentDescription: 'PC receiver simulation; no robot or motors' }),
    GetVoltage: () => ({ values: Array(16).fill(0) }),
    GetMotorStatus: () => ({ motors: Array.from({ length: 16 }, (_, id) => ({ id, online: false, statusCode: 0 })) }),
    Enable: () => { enabled = true; return {}; },
    Disable: () => { revoke(0); enabled = false; standing = false; return {}; },
    StandUp: () => { if (!enabled) throw new Error('precondition'); standing = true; return {}; },
    SitDown: () => { revoke(0); standing = false; return {}; },
    AcquireControl: (request, call) => {
      const caller = call.metadata.get('x-doso-dev-client');
      if (!/^[a-z][a-z0-9-]{0,63}@[a-z][a-z0-9-]{0,63}$/.test(request.clientId) || caller.length !== 1 || caller[0] !== request.clientId) throw new Error('principal');
      status();
      if (token || precondition()) return leaseReply(false, token ? reason('CONTROL_BUSY') : precondition());
      token = randomBytes(24).toString('hex'); principal = request.clientId;
      lastSequence = '0'; lastPayload = ''; lastWalkAt = null; initialZero = false;
      renew(); return leaseReply(true);
    },
    RenewControlLease: (request) => {
      if (!validToken(request.token)) return leaseReply(false, reason(request.token ? 'LEASE_EXPIRED' : 'LEASE_MISSING'));
      renew(); return leaseReply(true);
    },
    ReleaseControl: (request) => { if (validToken(request.token)) revoke(0); return status(); },
    WalkChecked: (request) => {
      const at = now();
      const intervalMs = lastReceived === null ? null : at - lastReceived;
      firstReceived ??= at; lastReceived = at; received++;
      if (intervalMs !== null) { intervals.push(intervalMs); if (intervals.length > maxRecords) intervals.shift(); }
      const sequence = String(request.sequence);
      const vector = request.direction && { x: request.direction.x, y: request.direction.y, z: request.direction.z };
      const payload = JSON.stringify(vector);
      const duplicate = sequence === lastSequence && payload === lastPayload;
      let why = !validToken(request.token) ? reason(request.token ? 'LEASE_EXPIRED' : 'LEASE_MISSING') : 0;
      if (!why && (!vector || !Object.values(vector).every(Number.isFinite) || Math.abs(vector.x) > .3 || Math.abs(vector.y) > .3 || Math.abs(vector.z) > .5)) why = reason('INVALID_VECTOR');
      if (!why) why = precondition();
      if (!why && (sequence === '0' || !duplicate && lastSequence !== '0' && BigInt(sequence) !== BigInt(lastSequence) + 1n)) why = reason('RATE_LIMITED');
      if (!why && !duplicate && lastWalkAt !== null && at - lastWalkAt < 18) why = reason('RATE_LIMITED');
      if (!why && !initialZero && Object.values(vector).some((value) => value !== 0)) why = reason('CONTROL_BUSY');
      if (!why && fault.rejectReason) why = fault.rejectReason;
      if (why) { rejected++; if (why !== reason('CONTROL_BUSY')) revoke(why); }
      else {
        accepted++; renew();
        if (!duplicate) { acceptedCommands++; lastSequence = sequence; lastPayload = payload; lastWalkAt = at; }
        if (Object.values(vector).every((value) => value === 0)) initialZero = true;
        moving = Object.values(vector).some((value) => value !== 0);
      }
      decision = why;
      const ackSequence = (BigInt(sequence) + BigInt(fault.ackSequenceOffset ?? 0)).toString();
      records.push({ source: 'SIMULATION', monoMs: at, sequence, intervalMs, vector, accepted: !why, reason: why, ackSequence });
      if (records.length > maxRecords) records.shift();
      return { accepted: !why, reason: why, sequence: ackSequence, status: status() };
    },
  };
  const definition = {}, implementation = {};
  for (const method of Object.values(service.methods)) {
    const requestType = method.resolvedRequestType, responseType = method.resolvedResponseType;
    definition[method.name] = {
      path: `/${SERVICE}/${method.name}`, requestStream: !!method.requestStream, responseStream: !!method.responseStream,
      requestSerialize: (value) => Buffer.from(requestType.encode(requestType.fromObject(value)).finish()),
      requestDeserialize: (bytes) => requestType.toObject(requestType.decode(bytes), { longs: String, defaults: true }),
      responseSerialize: (value) => Buffer.from(responseType.encode(responseType.fromObject(value)).finish()),
      responseDeserialize: (bytes) => responseType.toObject(responseType.decode(bytes), { longs: String, defaults: true }),
    };
    if (method.responseStream) implementation[method.name] = (call) => {
      countRpc(method.name);
      call.destroy({ code: grpc.status.UNIMPLEMENTED, details: 'SIMULATION unsupported' });
    };
    else implementation[method.name] = (call, callback) => {
      countRpc(method.name);
      const metadata = new grpc.Metadata(); metadata.set('x-doso-simulation', 'true'); call.sendMetadata(metadata);
      if (!handlers[method.name]) { callback({ code: grpc.status.UNIMPLEMENTED, details: 'SIMULATION unsupported' }); return; }
      let result;
      try {
        if (!['GetControlStatus', 'GetProfile', 'GetVoltage', 'GetMotorStatus'].includes(method.name)) {
          status();
          const callers = call.metadata.get('x-doso-dev-client');
          if (callers.length !== 1 || !/^[a-z][a-z0-9-]{0,63}@[a-z][a-z0-9-]{0,63}$/.test(callers[0])
            || token && ['WalkChecked', 'RenewControlLease', 'ReleaseControl'].includes(method.name) && callers[0] !== principal) throw new Error('principal');
        }
        result = handlers[method.name](call.request, call);
      }
      catch (error) { callback({ code: error.message === 'principal' ? grpc.status.PERMISSION_DENIED : grpc.status.FAILED_PRECONDITION, details: 'SIMULATION rejected' }); return; }
      if (method.name === 'WalkChecked' && fault.disconnect) { server.forceShutdown(); return; }
      const reply = () => { if (!call.cancelled) callback(null, result); };
      if (method.name === 'WalkChecked' && fault.delayMs) { const timer = setTimeout(reply, fault.delayMs); call.once('cancelled', () => clearTimeout(timer)); }
      else reply();
    };
  }
  const server = new grpc.Server({ 'grpc.max_receive_message_length': MAX_MESSAGE_BYTES, 'grpc.max_send_message_length': MAX_MESSAGE_BYTES });
  server.addService(definition, implementation);
  const port = await new Promise((resolve, reject) => server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, value) => error ? reject(error) : resolve(value)));
  let closed = false;
  return {
    source: 'SIMULATION', simulation: true, host: '127.0.0.1', port, protocol, definition,
    setFault(value = {}) {
      if (Object.keys(value).some((key) => !['rejectReason', 'ackSequenceOffset', 'delayMs', 'disconnect'].includes(key))
        || value.rejectReason !== undefined && (!Number.isInteger(value.rejectReason) || value.rejectReason < 0 || value.rejectReason > 9)
        || value.ackSequenceOffset !== undefined && ![0, 1].includes(value.ackSequenceOffset)
        || value.delayMs !== undefined && (!Number.isInteger(value.delayMs) || value.delayMs < 0 || value.delayMs > 10_000)
        || value.disconnect !== undefined && typeof value.disconnect !== 'boolean') throw new Error('Invalid simulation fault');
      fault = { ...value };
    },
    snapshot() {
      const state = status(); state.ownerId = 'SIMULATION';
      return { source: 'SIMULATION', simulation: true, limitation: 'PC protocol receiver only; no robot, motor, CAN or Dart FSM verification',
        rpcCounts: { ...rpcCounts }, received, accepted, rejected, acceptanceRate: received ? accepted / received : null,
        receivedHz: received > 1 ? (received - 1) * 1000 / (lastReceived - firstReceived) : null,
        intervalMs: summarizeSamples(intervals), retainedRecords: records.length, droppedRecords: received - records.length,
        maxRecords, stopCount, lastStop, moving, status: state, records: records.map((record) => ({ ...record, vector: record.vector && { ...record.vector } })) };
    },
    async close() { if (closed) return; closed = true; revoke(0); server.forceShutdown(); },
  };
}

export function summarizeSamples(values) {
  if (!values.length) return { count: 0, min: null, p50: null, p95: null, max: null, mean: null };
  const sorted = [...values].sort((a, b) => a - b);
  return { count: values.length, min: sorted[0], p50: sorted[Math.ceil(sorted.length * .5) - 1],
    p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1), mean: values.reduce((sum, value) => sum + value, 0) / values.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runLocalGrpcSimulation().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
