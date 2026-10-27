import { randomUUID } from 'node:crypto';
import http from 'node:http';
import grpc from '@grpc/grpc-js';
import { loadRobotControl } from './proto.js';
import { attachSimulationStreamServer } from './simulationStream.js';

const LOOPBACK = '127.0.0.1';
const LIMITS = Object.freeze({ linearMps: 0.25, yawRps: 0.5 });
const JSON_LIMIT = 16 * 1024;
const DEFAULT_ORIGINS = Object.freeze([
  'http://127.0.0.1:8109',
  'http://127.0.0.1:8130',
  'http://localhost:8130',
]);

function gatewayClosingError() {
  return Object.assign(new Error('simulation gateway is closing'), { statusCode: 503, shutdownSafe: true });
}

function shutdownWasSafelyCancelled(error) {
  return error?.shutdownSafe === true;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function grpcCall(client, method, request, timeoutMs = 1_000) {
  return new Promise((resolve, reject) => {
    client[method](request, { deadline: new Date(Date.now() + timeoutMs) }, (error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateVelocity(value) {
  if (!value || !finiteNumber(value.x) || !finiteNumber(value.y) || !finiteNumber(value.z)) {
    throw Object.assign(new Error('velocity must contain finite x, y and z numbers'), { statusCode: 400 });
  }
  if (Math.abs(value.x) > LIMITS.linearMps || Math.abs(value.y) > LIMITS.linearMps || Math.abs(value.z) > LIMITS.yawRps) {
    throw Object.assign(new Error('velocity exceeds the local simulation limits'), { statusCode: 422 });
  }
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

function validateAck(ack, expectedSequence) {
  if (!ack || ack.accepted !== true || Number(ack.sequence) !== expectedSequence || ack.status?.readyForWalk !== true) {
    throw new Error('Brainstem rejected or did not confirm the simulation command');
  }
  return ack;
}

function validateRelease(status) {
  if (!status || status.grpcLeaseActive !== false || status.owner === 'CONTROL_OWNER_GRPC') {
    throw new Error('Brainstem did not confirm simulation lease release');
  }
  return status;
}

function validateAttestation(value, expectedInstanceId) {
  if (!value || value.schemaVersion !== 1 || value.simulationOnly !== true
    || value.source !== 'brainstem.local-simulation'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value.instanceId)
    || value.instanceId !== expectedInstanceId) {
    throw new Error('Local simulation attestation does not match the expected instance');
  }
  return value;
}

async function readJsonBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > JSON_LIMIT) throw Object.assign(new Error('request body is too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('request body must be valid JSON'), { statusCode: 400 });
  }
}

function writeJson(response, statusCode, body) {
  const payload = Buffer.from(JSON.stringify(body));
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Content-Length', payload.length);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(payload);
}

export async function createGrpcSimulationAdapter({ protoRoot, grpcTarget, timeoutMs = 1_000 }) {
  if (grpcTarget !== '127.0.0.1:13147') throw new Error('Simulation gRPC target must be 127.0.0.1:13147');
  const RobotControl = await loadRobotControl(protoRoot);
  const client = new RobotControl(grpcTarget, grpc.credentials.createInsecure());
  return Object.freeze({
    acquire: (clientId) => grpcCall(client, 'acquireControl', { clientId }, timeoutMs),
    renew: (token) => grpcCall(client, 'renewControlLease', { token }, timeoutMs),
    release: (token) => grpcCall(client, 'releaseControl', { token }, timeoutMs),
    walk: (token, sequence, direction) => grpcCall(client, 'walkChecked', { token, sequence, direction }, timeoutMs),
    status: () => grpcCall(client, 'getControlStatus', {}, timeoutMs),
    close: () => client.close(),
  });
}

export async function createSimulationGateway({
  protoRoot,
  grpcTarget = '127.0.0.1:13147',
  observerOrigin = 'http://127.0.0.1:13148',
  expectedInstanceId,
  allowedOrigins = DEFAULT_ORIGINS,
  host = LOOPBACK,
  port = 8122,
  rpcAdapter,
  fetchImpl = fetch,
  now = Date.now,
  renewIntervalMs = 90,
  inactivityMs = 250,
  bootstrapMs = 1_000,
  commandSpacingMs = 25,
} = {}) {
  if (host !== LOOPBACK) throw new Error('Simulation gateway must bind to 127.0.0.1');
  if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(observerOrigin)) throw new Error('Simulation observer must use explicit IPv4 loopback HTTP');
  if (typeof expectedInstanceId !== 'string' || expectedInstanceId.length < 8) throw new Error('expectedInstanceId is required');
  for (const [name, value] of Object.entries({ renewIntervalMs, inactivityMs, bootstrapMs, commandSpacingMs })) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a finite positive number`);
  }
  const origins = new Set(allowedOrigins);
  const rpc = rpcAdapter ?? await createGrpcSimulationAdapter({ protoRoot, grpcTarget });
  const sessions = new Map();
  const inFlightCreates = new Set();
  const inFlightStops = new Set();
  const lifecycleFailures = [];
  let server;
  let streamServer;
  let closed = false;
  let closeInFlight;
  let queue = Promise.resolve();
  let lastWalkAt = 0;

  const serialize = (work, { enforceWalkSpacing = false } = {}) => {
    const run = queue.then(async () => {
      if (enforceWalkSpacing) {
        const wait = commandSpacingMs - (now() - lastWalkAt);
        if (wait > 0) await delay(wait);
      }
      try {
        return await work();
      } finally {
        if (enforceWalkSpacing) lastWalkAt = now();
      }
    });
    queue = run.catch(() => {});
    return run;
  };

  const observe = async () => {
    const response = await fetchImpl(`${observerOrigin}/api/v1/simulation/state`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Local simulation observer is unavailable');
    return validateAttestation(await response.json(), expectedInstanceId);
  };

  const walk = async (session, velocity, { allowStopping = false } = {}) => serialize(async () => {
    if (session.stopping && !allowStopping) throw new Error('simulation session is stopping');
    const sequence = ++session.grpcSequence;
    const ack = validateAck(await rpc.walk(session.token, sequence, velocity), sequence);
    session.lastAck = ack;
    return ack;
  }, { enforceWalkSpacing: true });

  const clearTimers = (session) => {
    clearInterval(session.renewTimer);
    clearTimeout(session.watchdogTimer);
  };

  const stopAndRelease = (session, reason) => {
    if (session.closing) return session.closing;
    session.stopping = true;
    session.closing = (async () => {
      clearTimers(session);
      sessions.delete(session.id);
      let zeroError;
      let releaseError;
      try {
        try {
          await walk(session, { x: 0, y: 0, z: 0 }, { allowStopping: true });
          session.lastSent = { x: 0, y: 0, z: 0 };
        } catch (error) {
          zeroError = error;
        }
        try {
          validateRelease(await serialize(() => rpc.release(session.token)));
        } catch (error) {
          releaseError = error;
        }
        session.closeReason = reason;
        if (zeroError || releaseError) throw new Error('simulation stop or release was not acknowledged');
      } finally {
        if (reason !== 'stream-release') session.closeStream?.();
      }
    })();
    inFlightStops.add(session.closing);
    void session.closing.catch((error) => lifecycleFailures.push(error)).finally(() => {
      inFlightStops.delete(session.closing);
    });
    return session.closing;
  };

  const armWatchdog = (session) => {
    clearTimeout(session.watchdogTimer);
    session.watchdogTimer = setTimeout(() => void stopAndRelease(session, 'inactivity').catch(() => {}), inactivityMs);
  };

  const armBootstrapTimeout = (session) => {
    clearTimeout(session.watchdogTimer);
    session.watchdogTimer = setTimeout(() => void stopAndRelease(session, 'bootstrap-timeout').catch(() => {}), bootstrapMs);
  };

  const beginLoops = (session) => {
    session.renewTimer = setInterval(() => {
      void serialize(async () => {
        if (closed || session.stopping) return;
        const lease = await rpc.renew(session.token);
        if (!lease?.accepted || lease.leaseDurationMs !== 300) throw new Error('simulation lease renewal was rejected');
      }).catch(() => stopAndRelease(session, 'renew-error').catch(() => {}));
    }, renewIntervalMs);
    armBootstrapTimeout(session);
  };

  const createSessionInternal = async (clientId) => {
    if (typeof clientId !== 'string' || clientId.length < 1 || clientId.length > 128) {
      throw Object.assign(new Error('clientId is required'), { statusCode: 400 });
    }
    if (closed) throw gatewayClosingError();
    await observe();
    if (closed) throw gatewayClosingError();
    const lease = await serialize(() => {
      if (closed) throw gatewayClosingError();
      return rpc.acquire(clientId);
    });
    if (!lease?.accepted || typeof lease.token !== 'string' || lease.token.length === 0 || lease.leaseDurationMs !== 300) {
      throw new Error('Brainstem did not grant the expected local simulation lease');
    }
    const session = {
      id: randomUUID(), token: lease.token, grpcSequence: 0, lastClientSequence: 0,
      lastSent: { x: 0, y: 0, z: 0 }, stopping: false, closing: null,
    };
    if (closed) {
      await stopAndRelease(session, 'gateway-close-during-acquire');
      throw gatewayClosingError();
    }
    try {
      await walk(session, session.lastSent);
    } catch (error) {
      session.stopping = true;
      try {
        validateRelease(await serialize(() => rpc.release(session.token)));
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'simulation bootstrap and cleanup were not acknowledged');
      }
      if (closed) throw gatewayClosingError();
      throw error;
    }
    if (closed) {
      await stopAndRelease(session, 'gateway-close-after-bootstrap');
      throw gatewayClosingError();
    }
    sessions.set(session.id, session);
    beginLoops(session);
    return session;
  };

  const createSession = (clientId) => {
    if (closed) return Promise.reject(gatewayClosingError());
    const operation = createSessionInternal(clientId);
    inFlightCreates.add(operation);
    void operation.finally(() => inFlightCreates.delete(operation)).catch(() => {});
    return operation;
  };

  const setInput = async (session, inputSequence, velocity) => {
    if (!Number.isSafeInteger(inputSequence) || inputSequence <= 0) {
      throw Object.assign(new Error('inputSequence must be a positive integer'), { statusCode: 400 });
    }
    if (inputSequence !== session.lastClientSequence + 1) {
      throw Object.assign(new Error('inputSequence must be contiguous and increasing'), { statusCode: 409 });
    }
    const safeVelocity = validateVelocity(velocity);
    session.lastClientSequence = inputSequence;
    armWatchdog(session);
    const ack = await walk(session, safeVelocity);
    session.lastSent = safeVelocity;
    return ack;
  };

  const allowedHost = (request) => {
    const value = request.headers.host;
    if (typeof value !== 'string') return false;
    const address = server?.address();
    return value === `127.0.0.1:${address?.port}` || value === `localhost:${address?.port}`;
  };

  const applyCors = (request, response) => {
    const origin = request.headers.origin;
    if (origin === undefined) return;
    if (typeof origin !== 'string' || !origins.has(origin)) throw Object.assign(new Error('origin is not allowed'), { statusCode: 403 });
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  };

  const allowedStreamOrigin = (request) => {
    const origin = request.headers.origin;
    if (origin === undefined) return true;
    if (typeof origin !== 'string') return false;
    if (origins.has(origin)) return true;
    const address = server?.address();
    return origin === `http://127.0.0.1:${address?.port}` || origin === `ws://127.0.0.1:${address?.port}`;
  };

  const requireJson = (request) => {
    const value = request.headers['content-type'];
    if (typeof value !== 'string') {
      throw Object.assign(new Error('content-type must be application/json'), { statusCode: 415 });
    }
    const parts = value.split(';').map((part) => part.trim());
    if (parts.shift()?.toLowerCase() !== 'application/json') {
      throw Object.assign(new Error('content-type must be application/json'), { statusCode: 415 });
    }
    for (const parameter of parts) {
      const match = /^charset\s*=\s*([a-z0-9_-]+)$/iu.exec(parameter);
      if (!match || match[1].toLowerCase() !== 'utf-8') {
        throw Object.assign(new Error('JSON content-type must use UTF-8'), { statusCode: 415 });
      }
    }
  };

  const handler = async (request, response) => {
    try {
      if (!allowedHost(request)) throw Object.assign(new Error('host is not allowed'), { statusCode: 403 });
      applyCors(request, response);
      if (request.method === 'OPTIONS') {
        const origin = request.headers.origin;
        const requestedMethod = request.headers['access-control-request-method'];
        const requestedHeaders = request.headers['access-control-request-headers'];
        if (typeof origin !== 'string' || !origins.has(origin)
          || !['GET', 'POST', 'PUT', 'DELETE'].includes(requestedMethod)
          || (requestedHeaders !== undefined && (Array.isArray(requestedHeaders)
            || requestedHeaders.split(',').some((value) => !['content-type', 'accept'].includes(value.trim().toLowerCase()))))) {
          throw Object.assign(new Error('preflight is not allowed'), { statusCode: 403 });
        }
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
        response.statusCode = 204;
        response.end();
        return;
      }
      const url = new URL(request.url, 'http://gateway.invalid');
      if (url.search) throw Object.assign(new Error('query parameters are not supported'), { statusCode: 400 });
      const sessionMatch = /^\/api\/v1\/simulation\/sessions\/([0-9a-f-]+)(?:\/input)?$/iu.exec(url.pathname);
      if (request.method === 'POST' && url.pathname === '/api/v1/simulation/sessions') {
        requireJson(request);
        const body = await readJsonBody(request);
        const session = await createSession(body.clientId);
        writeJson(response, 201, { schemaVersion: 1, simulationOnly: true, sessionId: session.id, ready: true, leaseDurationMs: 300, limits: LIMITS });
        return;
      }
      if (request.method === 'PUT' && sessionMatch && url.pathname.endsWith('/input')) {
        const session = sessions.get(sessionMatch[1]);
        if (!session || session.stopping) throw Object.assign(new Error('simulation session was not found'), { statusCode: 404 });
        try {
          if (session.transport === 'stream') {
            throw Object.assign(new Error('simulation session already uses the stream transport'), { statusCode: 409 });
          }
          session.transport = 'http';
          requireJson(request);
          const body = await readJsonBody(request);
          const ack = await setInput(session, body.inputSequence, body.velocity);
          writeJson(response, 200, { schemaVersion: 1, simulationOnly: true, sessionId: session.id, inputSequence: body.inputSequence, accepted: true, gRpcSequence: Number(ack.sequence), status: 'accepted' });
        } catch (error) {
          await stopAndRelease(session, 'invalid-input-or-command-error');
          throw error;
        }
        return;
      }
      if (request.method === 'DELETE' && sessionMatch && !url.pathname.endsWith('/input')) {
        const session = sessions.get(sessionMatch[1]);
        if (!session) throw Object.assign(new Error('simulation session was not found'), { statusCode: 404 });
        await stopAndRelease(session, 'client-release');
        writeJson(response, 200, { schemaVersion: 1, simulationOnly: true, released: true, zeroAcknowledged: true, sessionId: session.id });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/simulation/state') {
        const [status, observer] = await Promise.all([serialize(() => rpc.status()), observe()]);
        writeJson(response, 200, { schemaVersion: 1, simulationOnly: true, source: observer.source, instanceId: observer.instanceId, control: status, pose: observer.pose, velocity: observer.velocity, events: observer.events ?? [] });
        return;
      }
      throw Object.assign(new Error('route was not found'), { statusCode: 404 });
    } catch (error) {
      writeJson(response, error.statusCode ?? 502, { error: { message: error.statusCode ? error.message : 'local simulation gateway failed closed' } });
    }
  };

  server = http.createServer({ maxHeaderSize: 8 * 1024 }, handler);
  server.requestTimeout = 2_000;
  server.headersTimeout = 2_000;
  streamServer = attachSimulationStreamServer({
    server,
    allowedHost,
    allowedOrigin: allowedStreamOrigin,
    getSession: (sessionId) => sessions.get(sessionId),
    setInput,
    stopAndRelease,
  });

  const start = () => new Promise((resolve, reject) => {
    if (closed) {
      reject(gatewayClosingError());
      return;
    }
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server.address());
    });
  });
  const close = () => {
    if (closeInFlight) return closeInFlight;
    closed = true;
    closeInFlight = (async () => {
      const failures = [];
      const serverClosed = server.listening
        ? new Promise((resolve) => server.close((error) => error ? resolve(error) : resolve(undefined)))
        : Promise.resolve(undefined);
      const stopOperations = [...sessions.values()].map((session) => stopAndRelease(session, 'gateway-close'));
      const creationResults = await Promise.allSettled([...inFlightCreates]);
      for (const result of creationResults) {
        if (result.status === 'rejected' && !shutdownWasSafelyCancelled(result.reason)) failures.push(result.reason);
      }
      for (const session of sessions.values()) stopOperations.push(stopAndRelease(session, 'gateway-close'));
      await Promise.allSettled([...stopOperations, ...inFlightStops]);
      await queue;
      try { await streamServer.close(); } catch (error) { failures.push(error); }
      await Promise.allSettled([...inFlightStops]);
      failures.push(...lifecycleFailures);
      server.closeIdleConnections?.();
      const serverError = await serverClosed;
      if (serverError) failures.push(serverError);
      try { await rpc.close?.(); } catch (error) { failures.push(error); }
      if (failures.length) {
        throw new AggregateError(failures, 'simulation gateway shutdown could not confirm every session stopped');
      }
    })();
    return closeInFlight;
  };
  return Object.freeze({ start, close, server, limits: LIMITS });
}
