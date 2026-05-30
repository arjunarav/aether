import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {
  askAether,
  draftAction,
  getBriefing,
  getQueryLog,
  getRegret,
  getRelationships,
  getSources
} from '../lib/aether-data.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = process.cwd();

function sendJson(res, payload) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath, type) {
  res.writeHead(200, { 'Content-Type': type });
  res.end(fs.readFileSync(filePath));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/') {
      return sendFile(res, path.join(ROOT, 'public', 'preview.html'), 'text/html; charset=utf-8');
    }

    if (req.method === 'GET' && url.pathname === '/preview.js') {
      return sendFile(res, path.join(ROOT, 'public', 'preview.js'), 'text/javascript; charset=utf-8');
    }

    if (req.method === 'GET' && url.pathname === '/app/globals.css') {
      return sendFile(res, path.join(ROOT, 'app', 'globals.css'), 'text/css; charset=utf-8');
    }

    if (req.method === 'GET' && url.pathname === '/api/briefing') return sendJson(res, getBriefing('preview-auto'));
    if (req.method === 'GET' && url.pathname === '/api/relationships') return sendJson(res, getRelationships('preview-relationships'));
    if (req.method === 'GET' && url.pathname === '/api/regret') return sendJson(res, getRegret('preview-regret'));
    if (req.method === 'GET' && url.pathname === '/api/coral/sources') return sendJson(res, { sources: getSources() });
    if (req.method === 'GET' && url.pathname === '/api/coral/query-log') return sendJson(res, { queries: getQueryLog() });

    if (req.method === 'POST' && url.pathname === '/api/ask') return sendJson(res, askAether(await readBody(req)));
    if (req.method === 'POST' && url.pathname === '/api/actions/draft') return sendJson(res, draftAction(await readBody(req)));

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Aether preview running at http://${HOST}:${PORT}`);
});
