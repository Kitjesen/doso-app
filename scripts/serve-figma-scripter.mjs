import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const port = Number(process.argv[2] ?? 4182);
const root = path.resolve('scripts');
const assetRoot = path.resolve('assets', 'figma');
const exportRoot = path.resolve(process.argv[3] ?? 'artifacts/figma-export-staging');

createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (request.method === 'POST' && pathname.startsWith('/export/')) {
    const filename = path.basename(pathname);
    if (!/^[a-z0-9-]+\.png$/.test(filename)) {
      response.writeHead(400, { 'Access-Control-Allow-Origin': '*' });
      response.end('Invalid export filename');
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (!body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      response.writeHead(400, { 'Access-Control-Allow-Origin': '*' });
      response.end('Export is not PNG');
      return;
    }
    await mkdir(exportRoot, { recursive: true });
    await writeFile(path.join(exportRoot, filename), body);
    response.writeHead(201, { 'Access-Control-Allow-Origin': '*' });
    response.end(filename);
    return;
  }
  if (request.method === 'GET' && pathname.startsWith('/asset/')) {
    const filename = path.basename(pathname);
    if (!/^(?:nav-(?:home|map|tasks|analysis|profile)|routes-map-compact|analysis-chart-(?:light|dark))\.png$/.test(filename)) {
      response.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
      response.end('Not found');
      return;
    }
    const body = await readFile(path.join(assetRoot, filename));
    response.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'Content-Type': 'image/png',
    });
    response.end(body);
    return;
  }
  const filename = path.basename(pathname);
  try {
    const body = await readFile(path.join(root, filename));
    response.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'Content-Type': 'text/javascript; charset=utf-8',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
    response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Figma Scripter server listening on ${port}`));
