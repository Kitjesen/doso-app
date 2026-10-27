import { classifyNativeUi, invalidNativeUi } from './helpers/native-ui-state.mjs';

let result = invalidNativeUi();
try {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 8 * 1024 * 1024) throw new Error('input-limit');
    chunks.push(chunk);
  }
  result = classifyNativeUi(JSON.parse(Buffer.concat(chunks).toString('utf8')));
} catch {
  // Do not echo JSON/XML snippets or private attribute values, including parse errors.
}
process.stdout.write(JSON.stringify(result));
process.exitCode = result.state === 'invalid-input' ? 1 : 0;
