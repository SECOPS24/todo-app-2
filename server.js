'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3000;
const HOST = '0.0.0.0';
const MAX_BODY_BYTES = 10 * 1024;
const MAX_TEXT_LENGTH = 200;
const MAX_TODOS = 500;

const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));

// In-memory store: todos reset whenever the app restarts.
const todos = [];

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('not an object');
        }
        resolve(parsed);
      } catch (err) {
        reject(Object.assign(new Error('Body must be a JSON object'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://internal');
  const pathname = url.pathname;
  const method = req.method;

  if (method === 'GET' && pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }

  if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': INDEX_HTML.length,
      'Content-Security-Policy':
        "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
      'X-Content-Type-Options': 'nosniff',
    });
    return res.end(INDEX_HTML);
  }

  if (pathname === '/api/todos') {
    if (method === 'GET') {
      return sendJson(res, 200, todos);
    }
    if (method === 'POST') {
      const body = await readJsonBody(req);
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text) return sendJson(res, 400, { error: 'Todo text is required.' });
      if (text.length > MAX_TEXT_LENGTH) {
        return sendJson(res, 400, { error: `Todo text must be ${MAX_TEXT_LENGTH} characters or fewer.` });
      }
      if (todos.length >= MAX_TODOS) {
        return sendJson(res, 400, { error: 'Todo list is full. Delete some items first.' });
      }
      const todo = { id: crypto.randomUUID(), text, done: false, createdAt: new Date().toISOString() };
      todos.push(todo);
      return sendJson(res, 201, todo);
    }
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const match = pathname.match(/^\/api\/todos\/([0-9a-f-]{36})$/);
  if (match) {
    const index = todos.findIndex((t) => t.id === match[1]);
    if (index === -1) return sendJson(res, 404, { error: 'Todo not found.' });

    if (method === 'PATCH') {
      const body = await readJsonBody(req);
      if (typeof body.done !== 'boolean') {
        return sendJson(res, 400, { error: '"done" must be true or false.' });
      }
      todos[index].done = body.done;
      return sendJson(res, 200, todos[index]);
    }
    if (method === 'DELETE') {
      todos.splice(index, 1);
      res.writeHead(204);
      return res.end();
    }
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  return sendJson(res, 404, { error: 'Not found.' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    if (res.headersSent) return res.end();
    const status = err.status || 500;
    sendJson(res, status, { error: status === 500 ? 'Something went wrong.' : err.message });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Todo app listening on http://${HOST}:${PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
