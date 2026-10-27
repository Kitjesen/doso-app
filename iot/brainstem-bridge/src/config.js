import { isIP } from 'node:net';
import { isAbsolute, resolve } from 'node:path';

const DEFAULT_HTTP_HOST = '127.0.0.1';
const DEFAULT_HTTP_PORT = 8120;
export const GRPC_TIMEOUT_MS = 3_000;

function required(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function absolutePath(env, name) {
  const value = required(env, name);
  if (!isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path`);
  }
  return resolve(value);
}

export function isLoopbackHost(host) {
  if (host === 'localhost' || host === '::1') return true;
  if (isIP(host) === 4) return host.startsWith('127.');
  return false;
}

export function parseTarget(value) {
  if (typeof value !== 'string' || value.length === 0 || /[\s/@?#]/u.test(value)) {
    throw new Error('DOSO_BRAINSTEM_TARGET must be an explicit host:port target');
  }

  const ipv6 = /^\[(.+)\]:(\d+)$/u.exec(value);
  const hostPort = /^([^:]+):(\d+)$/u.exec(value);
  const match = ipv6 ?? hostPort;
  if (!match) throw new Error('DOSO_BRAINSTEM_TARGET must be an explicit host:port target');

  const host = match[1];
  if ((ipv6 && isIP(host) !== 6) || (!ipv6 && !/^[a-z0-9.-]+$/iu.test(host))) {
    throw new Error('DOSO_BRAINSTEM_TARGET has an invalid host');
  }
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('DOSO_BRAINSTEM_TARGET has an invalid port');
  }
  return { value, host, port, loopback: isLoopbackHost(host) };
}

function parsePort(value) {
  if (value === undefined || value === '') return DEFAULT_HTTP_PORT;
  if (!/^\d+$/u.test(value)) throw new Error('DOSO_BRAINSTEM_HTTP_PORT must be an integer');
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error('DOSO_BRAINSTEM_HTTP_PORT must be between 0 and 65535');
  }
  return port;
}

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/u.test(value) || Number(value) < 1) throw new Error(`${name} must be a positive integer`);
  return Number(value);
}

function parseOrigins(value) {
  if (!value) return new Set();
  const origins = value.split(',').map((entry) => entry.trim());
  if (origins.some((origin) => origin.length === 0 || origin === '*')) {
    throw new Error('DOSO_BRAINSTEM_ALLOWED_ORIGINS must contain explicit origins');
  }
  for (const origin of origins) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('DOSO_BRAINSTEM_ALLOWED_ORIGINS contains an invalid origin');
    }
    const originHost = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
      ? parsed.hostname.slice(1, -1)
      : parsed.hostname;
    const secureOrLoopback = parsed.protocol === 'https:'
      || (parsed.protocol === 'http:' && isLoopbackHost(originHost));
    if (!secureOrLoopback || parsed.origin !== origin || parsed.username || parsed.password) {
      throw new Error('DOSO_BRAINSTEM_ALLOWED_ORIGINS must use canonical HTTPS origins or loopback HTTP origins');
    }
  }
  return new Set(origins);
}

function optionalAbsolutePath(env, name) {
  const value = env[name];
  if (!value) return undefined;
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return resolve(value);
}

export function loadConfig(env = process.env) {
  const target = parseTarget(required(env, 'DOSO_BRAINSTEM_TARGET'));
  if (target.port !== 13_145) throw new Error('DOSO_BRAINSTEM_TARGET must use the Brainstem gRPC port 13145');
  const protoRoot = absolutePath(env, 'DOSO_BRAINSTEM_PROTO_ROOT');
  const bearerToken = required(env, 'DOSO_BRAINSTEM_BEARER_TOKEN');
  if (!/^[\x21-\x7e]{32,256}$/u.test(bearerToken)) {
    throw new Error('DOSO_BRAINSTEM_BEARER_TOKEN must be 32-256 non-space printable ASCII characters');
  }
  if (env.DOSO_BRAINSTEM_TLS_SERVER_NAME) {
    throw new Error('TLS server-name overrides are not supported');
  }

  const grpcCaPath = optionalAbsolutePath(env, 'DOSO_BRAINSTEM_GRPC_CA');
  const grpcCertPath = optionalAbsolutePath(env, 'DOSO_BRAINSTEM_GRPC_CLIENT_CERT');
  const grpcKeyPath = optionalAbsolutePath(env, 'DOSO_BRAINSTEM_GRPC_CLIENT_KEY');
  const grpcTlsPaths = [grpcCaPath, grpcCertPath, grpcKeyPath];
  const hasAllGrpcTls = grpcTlsPaths.every(Boolean);
  const hasAnyGrpcTls = grpcTlsPaths.some(Boolean);
  if (hasAnyGrpcTls && !hasAllGrpcTls) throw new Error('Brainstem mTLS requires CA, client certificate, and client key');

  const localInsecure = env.DOSO_BRAINSTEM_LOCAL_INSECURE === 'true';
  if (localInsecure && !target.loopback) throw new Error('Local insecure gRPC is restricted to loopback targets');
  if (!hasAllGrpcTls && !(target.loopback && localInsecure)) {
    throw new Error('Brainstem gRPC requires mTLS unless explicit loopback local-insecure mode is enabled');
  }

  const httpHost = env.DOSO_BRAINSTEM_HTTP_HOST || DEFAULT_HTTP_HOST;
  const httpLoopback = isLoopbackHost(httpHost);
  const httpCertPath = optionalAbsolutePath(env, 'DOSO_BRAINSTEM_HTTP_CERT');
  const httpKeyPath = optionalAbsolutePath(env, 'DOSO_BRAINSTEM_HTTP_KEY');
  if (Boolean(httpCertPath) !== Boolean(httpKeyPath)) throw new Error('HTTPS requires both certificate and key');
  if (!httpLoopback && !(httpCertPath && httpKeyPath)) {
    throw new Error('Non-loopback HTTP listening requires HTTPS certificate and key');
  }

  return Object.freeze({
    target,
    protoRoot,
    bearerToken,
    grpc: Object.freeze({
      timeoutMs: GRPC_TIMEOUT_MS,
      transport: hasAllGrpcTls ? 'mtls' : 'local-insecure',
      caPath: grpcCaPath,
      certPath: grpcCertPath,
      keyPath: grpcKeyPath,
    }),
    http: Object.freeze({
      host: httpHost,
      port: parsePort(env.DOSO_BRAINSTEM_HTTP_PORT),
      certPath: httpCertPath,
      keyPath: httpKeyPath,
      allowedOrigins: parseOrigins(env.DOSO_BRAINSTEM_ALLOWED_ORIGINS),
      maxConcurrent: parsePositiveInteger(env.DOSO_BRAINSTEM_MAX_CONCURRENT, 4, 'DOSO_BRAINSTEM_MAX_CONCURRENT'),
    }),
  });
}
