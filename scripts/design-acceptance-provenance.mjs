import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const STATES = Object.freeze([
  Object.freeze({ id: 'light', width: 390, height: 844 }),
  Object.freeze({ id: 'dark', width: 390, height: 844 }),
  Object.freeze({ id: 'landscape', width: 844, height: 390 }),
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function required(filePath) {
  invariant(existsSync(filePath) && statSync(filePath).isFile(), `Required provenance input is missing: ${filePath}`);
  return filePath;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid ${label}: ${filePath} (${error instanceof Error ? error.message : String(error)})`);
  }
}

function rawSha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function pngDimensions(filePath) {
  const bytes = readFileSync(filePath);
  invariant(bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE), `${filePath} is not a PNG`);
  invariant(bytes.toString('ascii', 12, 16) === 'IHDR', `${filePath} is missing PNG IHDR`);
  return { height: bytes.readUInt32BE(20), width: bytes.readUInt32BE(16) };
}

function validSha(value, label) {
  invariant(typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value), `${label} must be a SHA-256 digest`);
  return value.toLowerCase();
}

export function verifyAndroidCapture(directory, { pageId, runId }) {
  const capturePath = required(path.join(directory, 'app-capture.json'));
  const capture = readJson(capturePath, 'app-capture.json');
  invariant(capture?.schemaVersion === 1, `${capturePath} must use schemaVersion 1`);
  invariant(capture.pageId === pageId, `${pageId} capture metadata belongs to ${capture.pageId}`);
  invariant(capture.source === 'development-android-design-qa', `${capturePath} must record the development Android design-QA source`);
  invariant(typeof capture.serial === 'string' && capture.serial.trim(), `${capturePath} must record a non-empty Android serial`);
  invariant(typeof capture.state === 'string' && capture.state.trim(), `${capturePath} must record a non-empty QA state`);
  invariant(typeof capture.runId === 'string' && capture.runId.trim() && capture.runId === runId, `${capturePath} runId must match ${runId}`);
  for (const state of STATES) {
    const filename = `app-${state.id}.png`;
    const imagePath = required(path.join(directory, filename));
    const file = capture.files?.[filename];
    invariant(file?.width === state.width && file?.height === state.height, `${capturePath} has invalid ${filename} dimensions`);
    invariant(JSON.stringify(pngDimensions(imagePath)) === JSON.stringify({ height: state.height, width: state.width }), `${filename} PNG dimensions do not match ${state.width}x${state.height}`);
    invariant(validSha(file.sha256, `${capturePath} ${filename}`) === rawSha256(imagePath), `${capturePath} has a stale ${filename} hash`);
  }
  return capture;
}

export function verifyFigmaExport(directory, { figma, runId }) {
  const exportPath = required(path.join(directory, 'figma-export.json'));
  const receipt = readJson(exportPath, 'figma-export.json');
  invariant(receipt?.schemaVersion === 1, `${exportPath} must use schemaVersion 1`);
  invariant(receipt.runId === runId && typeof receipt.runId === 'string' && receipt.runId.trim(), `${exportPath} runId must match ${runId}`);
  invariant(receipt.fileKey === figma.fileKey, `${exportPath} fileKey does not match the manifest`);
  invariant(['figma-native-export', 'figma-api-export'].includes(receipt.producer), `${exportPath} has an invalid producer`);
  invariant(Number.isFinite(Date.parse(receipt.exportedAt)) && Date.parse(receipt.exportedAt) <= Date.now(), `${exportPath} has an invalid exportedAt`);
  invariant(typeof receipt.receipt === 'string' && receipt.receipt.trim(), `${exportPath} must contain a non-empty source receipt`);
  for (const state of STATES) {
    const filename = `figma-${state.id}.png`;
    const imagePath = required(path.join(directory, filename));
    const nodeId = figma.nodes[state.id];
    invariant(receipt.nodes?.[state.id] === nodeId, `${exportPath} ${state.id} node does not match the manifest`);
    const file = receipt.files?.[filename];
    invariant(file?.nodeId === nodeId, `${exportPath} ${filename} nodeId does not match the manifest`);
    invariant(validSha(file.sha256, `${exportPath} ${filename}`) === rawSha256(imagePath), `${exportPath} has a stale ${filename} hash`);
  }
  return receipt;
}
