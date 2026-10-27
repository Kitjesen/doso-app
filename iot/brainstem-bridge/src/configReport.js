/**
 * Redacted, read-only configuration report for operators.
 *
 * It intentionally exposes booleans and protocol names only. Paths, bearer
 * tokens, certificate contents and upstream addresses never leave the process.
 */
export function summarizeConfig(config, pathExists = () => true) {
  const protoRootPresent = Boolean(config?.protoRoot) && pathExists(config.protoRoot);
  const grpcPaths = [config?.grpc?.caPath, config?.grpc?.certPath, config?.grpc?.keyPath];
  const httpPaths = [config?.http?.certPath, config?.http?.keyPath];
  const grpcFilesPresent = grpcPaths.every(path => !path || pathExists(path));
  const httpFilesPresent = httpPaths.every(path => !path || pathExists(path));
  const mtlsConfigured = config?.grpc?.transport === 'mtls';
  const httpTlsConfigured = Boolean(config?.http?.certPath && config?.http?.keyPath);

  return Object.freeze({
    ok: protoRootPresent && grpcFilesPresent && httpFilesPresent,
    target: Object.freeze({
      configured: Boolean(config?.target),
      port: config?.target?.port ?? null,
      loopback: config?.target?.loopback === true,
    }),
    proto: Object.freeze({
      configured: Boolean(config?.protoRoot),
      present: protoRootPresent,
    }),
    grpc: Object.freeze({
      transport: mtlsConfigured ? 'mtls' : 'local-insecure',
      timeoutMs: config?.grpc?.timeoutMs ?? null,
      caConfigured: Boolean(config?.grpc?.caPath),
      clientCertificateConfigured: Boolean(config?.grpc?.certPath),
      clientKeyConfigured: Boolean(config?.grpc?.keyPath),
      filesPresent: grpcFilesPresent,
      access: 'read-only',
      statusRpc: 'GetControlStatus',
      motionRpc: false,
      controlLeaseRpc: false,
    }),
    http: Object.freeze({
      loopback: config?.http?.host === '127.0.0.1' || config?.http?.host === 'localhost' || config?.http?.host === '::1',
      port: config?.http?.port ?? null,
      tlsConfigured: httpTlsConfigured,
      filesPresent: httpFilesPresent,
    }),
    control: Object.freeze({
      productionExecutor: false,
      lease: false,
      ack: false,
      deadmanStop: false,
      reason: '桥接服务当前只提供 GetControlStatus；运动、租约和电机 RPC 未开放。',
    }),
  });
}
