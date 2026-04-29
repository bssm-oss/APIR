#!/usr/bin/env node
import fs from 'node:fs/promises';

import { Command } from 'commander';

import { Scanner } from './scanner.js';
import { startServer } from './index.js';

const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const program = new Command();

if (LOG_LEVEL === 'debug') {
  console.log('[cli] Debug logging enabled');
}

program
  .name('apir')
  .description('API Hunter scanner for discovering exposed and buried API endpoints')
  .version('0.1.0');

program
  .command('scan')
  .description('Scan a target URL for API exposure')
  .argument('[targetUrl]', 'Target URL to scan')
  .option('--skip <phases>', 'Comma-separated phase names to skip')
  .option('--quick', 'Quick scan: only sourcemap, window, metadata phases')
  .option('--active', 'Enable browser-driven active phases: dynamic, serviceworker, phantom')
  .option('--output <file>', 'Write JSON report to a file instead of stdout')
  .option('--port <port>', 'Port to use when starting server mode', parsePort)
  .option('--server', 'Start the Express server instead of running a scan')
  .action(async (targetUrl, options) => {
    if (options.server) {
      startServer({ port: options.port });
      return;
    }

    if (!targetUrl) {
      throw new Error('targetUrl is required unless --server is provided');
    }

    const scanner = new Scanner();
    const report = await scanner.scan(targetUrl, {
      skipPhases: parseSkipPhases(options.skip),
      quick: options.quick ?? false,
      active: options.active ?? false,
    });
    const serializedReport = `${JSON.stringify(report, null, 2)}\n`;

    if (options.output) {
      await fs.writeFile(options.output, serializedReport, 'utf8');
      return;
    }

    process.stdout.write(serializedReport);
  });

program
  .option('--server', 'Start the Express server')
  .option('--port <port>', 'Port to use when starting server mode', parsePort)
  .action((options) => {
    if (options.server) {
      startServer({ port: options.port });
      return;
    }

    program.help();
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(formatError(error));
  process.exitCode = 1;
});

function parseSkipPhases(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(',')
    .map((phase) => phase.trim())
    .filter(Boolean);
}

function parsePort(value) {
  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid port: ${value}`);
  }

  return port;
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
