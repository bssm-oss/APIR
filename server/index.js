import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from 'cors';
import express from 'express';

import { Scanner } from './scanner.js';

const PORT = Number.parseInt(process.env.PORT ?? '3001', 10);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? '*';
const SCAN_API_KEY = process.env.SCAN_API_KEY ?? '';
const SCAN_RATE_LIMIT_WINDOW_MS = Number.parseInt(process.env.SCAN_RATE_LIMIT_WINDOW_MS ?? '60000', 10);
const SCAN_RATE_LIMIT_MAX = Number.parseInt(process.env.SCAN_RATE_LIMIT_MAX ?? '20', 10);
const SCAN_MAX_ACTIVE_REQUESTS = Number.parseInt(process.env.SCAN_MAX_ACTIVE_REQUESTS ?? '2', 10);
const VERSION = '0.1.0';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '../client/dist');

export function createApp({ scanner = new Scanner() } = {}) {
  const app = express();
  const rateLimits = new Map();
  let activeScans = 0;

  app.use(cors({ origin: CLIENT_ORIGIN }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', version: VERSION });
  });

  app.post('/api/scan', async (request, response) => {
    const { targetUrl, options } = request.body ?? {};

    if (!targetUrl || typeof targetUrl !== 'string') {
      response.status(400).json({ error: 'targetUrl is required' });
      return;
    }

    if (!isAuthorized(request)) {
      response.status(401).json({ error: 'Missing or invalid scan API key' });
      return;
    }

    if (isRateLimited(request, rateLimits)) {
      response.status(429).json({ error: 'Scan rate limit exceeded' });
      return;
    }

    if (activeScans >= SCAN_MAX_ACTIVE_REQUESTS) {
      response.status(429).json({ error: 'Too many scans are already running' });
      return;
    }

    try {
      activeScans += 1;
      const report = await scanner.scan(targetUrl, options ?? {});
      response.json(report);
    } catch (error) {
      response.status(400).json({ error: formatError(error) });
    } finally {
      activeScans -= 1;
    }
  });

  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', (_request, response) => {
      response.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }

  return app;
}

function isAuthorized(request) {
  if (!SCAN_API_KEY) {
    return true;
  }

  const authorization = request.get('authorization') ?? '';
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
  return request.get('x-apir-api-key') === SCAN_API_KEY || bearerToken === SCAN_API_KEY;
}

function isRateLimited(request, rateLimits) {
  const now = Date.now();
  const key = request.ip ?? request.socket.remoteAddress ?? 'unknown';
  const bucket = rateLimits.get(key) ?? { count: 0, resetAt: now + SCAN_RATE_LIMIT_WINDOW_MS };

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + SCAN_RATE_LIMIT_WINDOW_MS;
  }

  bucket.count += 1;
  rateLimits.set(key, bucket);

  return bucket.count > SCAN_RATE_LIMIT_MAX;
}

export function startServer({ port = PORT, scanner } = {}) {
  const app = createApp({ scanner });
  return app.listen(port, () => {
    console.log(`APIR server listening on port ${port}`);
  });
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export default createApp;
