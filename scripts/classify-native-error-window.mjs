import { classifyErrorWindow } from './helpers/native-error-window.mjs';

const UNKNOWN = {
  windowKind: 'unknown',
  expectedTitleMatch: 'unknown',
  rawValuesRetained: false,
};

let result = UNKNOWN;
let validInput = false;
try {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 8 * 1024 * 1024) throw new Error('input-limit');
    chunks.push(chunk);
  }
  result = classifyErrorWindow(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  validInput = true;
} catch {
  // Never echo input, parse errors, dump text, titles, or process identifiers.
}

process.stdout.write(JSON.stringify(result));
process.exitCode = validInput ? 0 : 1;
