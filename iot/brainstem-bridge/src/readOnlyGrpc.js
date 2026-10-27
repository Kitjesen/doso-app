import grpc from '@grpc/grpc-js';
import { bridgeError, ERRORS } from './errors.js';
import { loadRobotControl, readTlsFiles } from './proto.js';

const STATE_KINDS = new Set([
  'CMS_STATE_KIND_ZERO',
  'CMS_STATE_KIND_GROUNDED',
  'CMS_STATE_KIND_STANDING',
  'CMS_STATE_KIND_WALKING',
  'CMS_STATE_KIND_TRANSITIONING',
]);
const TRANSITION_KINDS = new Set([
  'CMS_TRANSITION_KIND_NONE',
  'CMS_TRANSITION_KIND_STAND_UP',
  'CMS_TRANSITION_KIND_SIT_DOWN',
  'CMS_TRANSITION_KIND_GESTURE',
]);
const CONTROL_OWNERS = new Set([
  'CONTROL_OWNER_NONE',
  'CONTROL_OWNER_GRPC',
  'CONTROL_OWNER_YUNZHUO',
]);

function assertEnum(value, allowed) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw bridgeError(ERRORS.invalidUpstreamResponse);
  }
  return value;
}

function normalizeStatus(status) {
  if (!status || typeof status !== 'object' || !status.fsm || typeof status.fsm !== 'object') {
    throw bridgeError(ERRORS.invalidUpstreamResponse);
  }
  if (typeof status.motorOutputEnabled !== 'boolean' || typeof status.criticalMotorFault !== 'boolean') {
    throw bridgeError(ERRORS.invalidUpstreamResponse);
  }
  return Object.freeze({
    state: Object.freeze({
      kind: assertEnum(status.fsm.kind, STATE_KINDS),
      transition: assertEnum(status.fsm.transition, TRANSITION_KINDS),
    }),
    control: Object.freeze({
      owner: assertEnum(status.owner, CONTROL_OWNERS),
      motorOutputEnabled: status.motorOutputEnabled,
      criticalMotorFault: status.criticalMotorFault,
    }),
  });
}

function getControlStatus(client, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(bridgeError(ERRORS.upstreamUnavailable));
      return;
    }

    let call;
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => {
      call?.cancel();
      finish(reject, bridgeError(ERRORS.upstreamUnavailable));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    call = client.getControlStatus({}, { deadline: new Date(Date.now() + timeoutMs) }, (error, status) => {
      if (error) {
        if (error.code === grpc.status.DEADLINE_EXCEEDED) {
          finish(reject, bridgeError(ERRORS.upstreamTimeout));
        } else {
          finish(reject, bridgeError(ERRORS.upstreamUnavailable));
        }
        return;
      }
      try {
        finish(resolve, normalizeStatus(status));
      } catch (error_) {
        finish(reject, error_);
      }
    });
    if (signal?.aborted) onAbort();
  });
}

export async function createReadOnlyGrpcAdapter(config) {
  const RobotControl = await loadRobotControl(config.protoRoot);
  let credentials;
  if (config.grpc.transport === 'local-insecure') {
    if (!config.target.loopback) throw new Error('Insecure credentials are restricted to loopback targets');
    credentials = grpc.credentials.createInsecure();
  } else if (config.grpc.transport === 'mtls') {
    const tls = await readTlsFiles(config.grpc);
    credentials = grpc.credentials.createSsl(tls.rootCert, tls.privateKey, tls.certChain);
  } else {
    throw new Error('Unsupported gRPC transport');
  }

  const client = new RobotControl(config.target.value, credentials);
  let closed = false;
  return Object.freeze({
    transport: config.grpc.transport,
    async readStatus({ signal } = {}) {
      if (closed) throw bridgeError(ERRORS.upstreamUnavailable);
      return getControlStatus(client, config.grpc.timeoutMs, signal);
    },
    close() {
      if (!closed) client.close();
      closed = true;
    },
  });
}
