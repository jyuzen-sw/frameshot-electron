import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../examples/demo-site');
const port = Number(process.env.PORT || 4321);

const server = createServer((request, response) => {
  const pathname = request.url === '/' ? '/index.html' : request.url?.split('?')[0] || '/index.html';
  const filePath = path.resolve(root, `.${pathname}`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  const stream = createReadStream(filePath);
  stream.once('error', () => response.writeHead(404).end('Not found'));
  response.setHeader('cache-control', 'no-store');
  response.setHeader('content-type', filePath.endsWith('.svg') ? 'image/svg+xml' : filePath.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8');
  stream.pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`FrameShot demo: http://localhost:${port}`);
});
