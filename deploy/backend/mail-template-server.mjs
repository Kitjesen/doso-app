import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_TEMPLATE_BYTES = 64 * 1024;

export function createTemplateHandler(template) {
  const body = Buffer.from(template);
  if (body.length === 0 || body.length > MAX_TEMPLATE_BYTES || !body.includes('{{ .Token }}') || body.includes('ConfirmationURL')) {
    throw new Error('invalid_confirmation_template');
  }
  return (request, response) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Connection: 'close' };
    // Compare the raw target so decoding or normalization cannot widen the route.
    if (request.url !== '/confirmation.html') {
      response.writeHead(404, { ...headers, 'Content-Length': 0 });
      response.end();
    } else if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { ...headers, Allow: 'GET, HEAD', 'Content-Length': 0 });
      response.end();
    } else {
      response.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length });
      response.end(request.method === 'HEAD' ? undefined : body);
    }
  };
}

async function main() {
  if (process.argv.length !== 2) throw new Error('arguments_not_allowed');
  const file = await open(new URL('./confirmation.html', import.meta.url), constants.O_RDONLY | constants.O_NOFOLLOW);
  let body;
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > MAX_TEMPLATE_BYTES) throw new Error('invalid_confirmation_template');
    body = await file.readFile();
  } finally {
    await file.close();
  }
  const server = createServer({ maxHeaderSize: 4096, headersTimeout: 5000, requestTimeout: 5000 }, createTemplateHandler(body));
  server.maxConnections = 32;
  server.on('error', () => {
    console.error('mail_template_server_failed');
    process.exitCode = 1;
  });
  server.listen(8080, '0.0.0.0');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('mail_template_server_failed');
    process.exitCode = 1;
  });
}
