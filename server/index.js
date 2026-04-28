import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from 'cors';
import express from 'express';

import { Scanner } from './scanner.js';

const PORT = Number.parseInt(process.env.PORT ?? '3001', 10);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? '*';
const VERSION = '0.1.0';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '../client/dist');

export function createApp({ scanner = new Scanner() } = {}) {
  const app = express();

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

    try {
      const report = await scanner.scan(targetUrl, options ?? {});
      response.json(report);
    } catch (error) {
      response.status(400).json({ error: formatError(error) });
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
