import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

export const PROTO_RELATIVE_PATH = join('brainstem_api', 'cms.proto');

export async function loadRobotControl(protoRoot) {
  const cmsPath = join(protoRoot, PROTO_RELATIVE_PATH);
  const commonPath = join(protoRoot, 'brainstem_api', 'common.proto');
  await Promise.all([access(cmsPath, constants.R_OK), access(commonPath, constants.R_OK)]);
  const definition = await protoLoader.load(cmsPath, {
    includeDirs: [protoRoot],
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(definition);
  const RobotControl = loaded?.brainstem?.api?.v1?.RobotControl;
  if (typeof RobotControl !== 'function') throw new Error('RobotControl service was not found in cms.proto');
  return RobotControl;
}

export async function readTlsFiles({ caPath, certPath, keyPath }) {
  const [rootCert, certChain, privateKey] = await Promise.all([
    readFile(caPath),
    readFile(certPath),
    readFile(keyPath),
  ]);
  return { rootCert, certChain, privateKey };
}
