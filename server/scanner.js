import axios from 'axios';

import { extractSourceMaps } from './phases/sourcemap.js';
import { harvestWindowObject } from './phases/window.js';
import { analyzeChunks } from './phases/chunks.js';
import { extractMetadata } from './phases/metadata.js';
import { dynamicTriggerExposure } from './phases/dynamic.js';
import { analyzeGraphQL } from './phases/graphql.js';
import { analyzeServiceWorker } from './phases/serviceworker.js';
import { phantomFlow } from './phases/phantom.js';
import { analyzeJWT } from '../lib/jwt-analyzer.js';
import { checkCORS } from '../lib/cors-checker.js';
import { fingerprint } from '../lib/fingerprint.js';
import { generateReport } from '../lib/reporter.js';
import { assertAllowedTargetUrl, createRequestPolicy, limitCorsEndpoints } from '../lib/url-policy.js';

const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.SCAN_TIMEOUT_MS ?? '30000', 10);
const DEFAULT_CONCURRENCY = 1;
const MAX_CONCURRENCY = Number.parseInt(process.env.SCAN_MAX_CONCURRENCY ?? '3', 10);
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const ACTIVE_PHASES = new Set(['dynamic', 'serviceworker', 'phantom']);

const PHASES = [
  {
    name: 'sourcemap',
    run: (targetUrl, httpClient) => extractSourceMaps(targetUrl, httpClient),
  },
  {
    name: 'window',
    run: (targetUrl, httpClient) => harvestWindowObject(targetUrl, httpClient),
  },
  {
    name: 'chunks',
    run: (targetUrl, httpClient) => analyzeChunks(targetUrl, httpClient),
  },
  {
    name: 'metadata',
    run: (targetUrl, httpClient) => extractMetadata(targetUrl, httpClient),
  },
  {
    name: 'dynamic',
    run: (targetUrl) => dynamicTriggerExposure(targetUrl),
  },
  {
    name: 'graphql',
    run: (targetUrl, httpClient, phaseResults) =>
      analyzeGraphQL(targetUrl, httpClient, phaseResults.sourcemap, collectDiscoveredGraphQLPaths(phaseResults)),
  },
  {
    name: 'serviceworker',
    run: (targetUrl) => analyzeServiceWorker(targetUrl),
  },
  {
    name: 'phantom',
    run: (targetUrl) => phantomFlow(targetUrl),
  },
];

export class Scanner {
  constructor({ httpClient } = {}) {
    this.httpClient = httpClient ?? createHttpClient();
  }

  async scan(targetUrl, options = {}) {
    const requestPolicy = createRequestPolicy(targetUrl);
    const normalizedTargetUrl = requestPolicy.targetUrl;

    const normalizedOptions = normalizeOptions(options);
    const phases = {};
    const timings = {};

    await runScanPhases(normalizedOptions, normalizedTargetUrl, this.httpClient, phases, timings);

    const utilityResults = await runUtilityAnalysis(normalizedTargetUrl, phases, this.httpClient, requestPolicy);
    const scanResults = {
      targetUrl: normalizedTargetUrl,
      phases,
      jwtTokens: utilityResults.jwtAnalysis,
      corsResults: utilityResults.corsResults,
      serverFingerprint: utilityResults.serverFingerprint,
      metadata: {
        phaseTimings: timings,
        skippedPhases: [...normalizedOptions.skipPhases],
        concurrency: normalizedOptions.concurrency,
        active: normalizedOptions.active,
        phaseErrors: collectPhaseErrors(phases),
        phaseMetadata: collectPhaseMetadata(phases),
        utilityErrors: utilityResults.errors,
      },
    };

    const report = generateReport(normalizedTargetUrl, scanResults);
    return {
      ...report,
      metadata: scanResults.metadata,
    };
  }
}

export function createHttpClient() {
  const client = axios.create({
    timeout: DEFAULT_TIMEOUT_MS,
    validateStatus: (status) => status >= 200 && status < 400,
    beforeRedirect: (options) => {
      const protocol = options.protocol ?? 'https:';
      const host = options.hostname ?? options.host;
      assertAllowedTargetUrl(`${protocol}//${host}${options.path ?? '/'}`);
    },
  });

  client.interceptors.request.use((config) => {
    const baseUrl = config.baseURL;
    const requestUrl = new URL(config.url ?? '', baseUrl).toString();
    assertAllowedTargetUrl(requestUrl);
    return config;
  });

  return client;
}

export function createError(code, message, meta = {}) {
  return { code, message, ...meta };
}

async function runPhase(phase, targetUrl, httpClient, phaseResults) {
  const startedAt = Date.now();

  if (LOG_LEVEL === 'debug') {
    console.log(`[scanner] Starting phase: ${phase.name}`);
  }

  try {
    const output = await phase.run(targetUrl, httpClient, phaseResults);
    const durationMs = Date.now() - startedAt;

    if (LOG_LEVEL === 'debug') {
      console.log(`[scanner] Finished phase: ${phase.name} (${durationMs}ms)`);
    }

    return {
      durationMs,
      result: normalizePhaseResult(output, phase.name, durationMs),
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;

    if (LOG_LEVEL === 'debug') {
      console.log(`[scanner] Failed phase: ${phase.name} (${durationMs}ms)`);
    }

    return {
      durationMs,
      result: {
        apis: [],
        errors: [formatError(error, 'PHASE_FAILED', { phase: phase.name }, `${phase.name} phase failed`)],
        metadata: {
          phase: phase.name,
          durationMs,
          failed: true,
        },
      },
    };
  }
}

async function runScanPhases(options, targetUrl, httpClient, phaseResults, timings) {
  if (options.concurrency === 1) {
    await runPhaseBatch(PHASES, options, targetUrl, httpClient, phaseResults, timings);
    return;
  }

  const independentPhases = PHASES.filter((phase) => phase.name !== 'graphql');
  const dependentPhases = PHASES.filter((phase) => phase.name === 'graphql');

  await runPhaseBatch(independentPhases, options, targetUrl, httpClient, phaseResults, timings);
  await runPhaseBatch(dependentPhases, options, targetUrl, httpClient, phaseResults, timings);
}

async function runPhaseBatch(batch, options, targetUrl, httpClient, phaseResults, timings) {
  if (options.concurrency === 1) {
    for (const phase of batch) {
      recordPhaseOutcome(phaseResults, timings, await runPhaseWithSkip(phase, options, targetUrl, httpClient, phaseResults));
    }
    return;
  }

  const outcomes = await Promise.all(batch.map((phase) => runPhaseWithSkip(phase, options, targetUrl, httpClient, phaseResults)));

  for (const outcome of outcomes) {
    recordPhaseOutcome(phaseResults, timings, outcome);
  }
}

async function runPhaseWithSkip(phase, options, targetUrl, httpClient, phaseResults) {
  if (options.skipPhases.has(phase.name)) {
    return {
      phaseName: phase.name,
      durationMs: 0,
      result: createSkippedPhaseResult(phase.name),
    };
  }

  const { result, durationMs } = await runPhase(phase, targetUrl, httpClient, phaseResults);
  return {
    phaseName: phase.name,
    durationMs,
    result,
  };
}

function recordPhaseOutcome(phaseResults, timings, outcome) {
  phaseResults[outcome.phaseName] = outcome.result;
  timings[outcome.phaseName] = outcome.durationMs;
}

function normalizePhaseResult(output, phaseName, durationMs) {
  const result = output && typeof output === 'object' ? output : {};
  return {
    ...result,
    apis: Array.isArray(result.apis) ? result.apis : [],
    errors: normalizeErrors(result.errors, phaseName),
    metadata: {
      ...(result.metadata ?? {}),
      phase: phaseName,
      durationMs,
    },
  };
}

function normalizeErrors(errors, phaseName) {
  if (!Array.isArray(errors)) {
    return [];
  }

  return errors.map((error) => {
    if (error && typeof error === 'object' && typeof error.code === 'string' && typeof error.message === 'string') {
      return error;
    }

    return createError('PHASE_FAILED', String(error), { phase: phaseName });
  });
}

async function runUtilityAnalysis(targetUrl, phases, httpClient, requestPolicy) {
  const errors = [];
  const phaseData = Object.fromEntries(Object.entries(phases).filter(([, output]) => !output?.metadata?.skipped));
  const endpoints = limitCorsEndpoints(collectEndpoints(phaseData, requestPolicy));
  const headers = await fetchTargetHeaders(targetUrl, httpClient, errors);

  return {
    jwtAnalysis: safelyRunSync('JWT analysis', errors, () => analyzeJWT(phaseData)),
    corsResults: await safelyRunAsync('CORS check', errors, () => checkCORS(endpoints, httpClient, { requestPolicy })),
    serverFingerprint: safelyRunSync('server fingerprint', errors, () => fingerprint(headers)),
    errors,
  };
}

function collectEndpoints(phases, requestPolicy) {
  const endpoints = new Set();

  for (const phase of Object.values(phases)) {
    for (const api of phase.apis ?? []) {
      const value = api?.url ?? api?.endpoint ?? api?.path;
      const endpoint = resolveEndpoint(value, requestPolicy);

      if (endpoint) {
        endpoints.add(endpoint);
      }
    }
  }

  return [...endpoints];
}

function collectDiscoveredGraphQLPaths(phaseResults) {
  const paths = phaseResults.metadata?.metadata?.discoveredGraphQLPaths;
  return Array.isArray(paths) ? paths : [];
}

function resolveEndpoint(value, requestPolicy) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  try {
    return requestPolicy.resolveSameOrigin(value);
  } catch {
    return null;
  }
}

async function fetchTargetHeaders(targetUrl, httpClient, errors) {
  try {
    const response = await httpClient.get(targetUrl, {
      responseType: 'text',
      transformResponse: [(body) => body],
    });
    return response.headers ?? {};
  } catch (error) {
    errors.push(formatError(error, 'FETCH_FAILED', { phase: 'utility' }, 'Header fingerprint fetch failed'));
    return {};
  }
}

function normalizeOptions(options) {
  const isQuick = options.quick === true;
  const isActive = options.active === true;
  const skipPhases = new Set(normalizeSkipPhases(options.skipPhases ?? options.skip));

  if (!isActive) {
    for (const phaseName of ACTIVE_PHASES) {
      skipPhases.add(phaseName);
    }
  }

  if (isQuick) {
    const quickPhases = ['sourcemap', 'window', 'metadata'];
    for (const phase of PHASES) {
      if (!quickPhases.includes(phase.name)) {
        skipPhases.add(phase.name);
      }
    }
  }

  return {
    skipPhases,
    concurrency: normalizeConcurrency(options.concurrency),
    quick: isQuick,
    active: isActive,
  };
}

function normalizeSkipPhases(skipPhases) {
  if (!skipPhases) {
    return [];
  }

  const values = Array.isArray(skipPhases) ? skipPhases : String(skipPhases).split(',');
  const knownPhases = new Set(PHASES.map((phase) => phase.name));

  const normalizedPhases = values.map((phase) => String(phase).trim()).filter(Boolean);
  const unknownPhases = normalizedPhases.filter((phase) => !knownPhases.has(phase));

  if (unknownPhases.length > 0) {
    throw new Error(`Invalid skip phase: ${unknownPhases.join(', ')}`);
  }

  return normalizedPhases;
}

function normalizeConcurrency(concurrency) {
  const parsed = Number.parseInt(concurrency, 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_CONCURRENCY) : DEFAULT_CONCURRENCY;
}

function createSkippedPhaseResult(phaseName) {
  return {
    apis: [],
    errors: [],
    metadata: {
      phase: phaseName,
      durationMs: 0,
      skipped: true,
    },
  };
}

function collectPhaseErrors(phases) {
  return Object.fromEntries(Object.entries(phases).map(([phaseName, result]) => [phaseName, result?.errors ?? []]));
}

function collectPhaseMetadata(phases) {
  return Object.fromEntries(Object.entries(phases).map(([phaseName, result]) => [phaseName, result?.metadata ?? {}]));
}

function safelyRunSync(label, errors, action) {
  try {
    return action();
  } catch (error) {
    errors.push(formatError(error, 'PHASE_FAILED', { phase: 'utility' }, `${label} failed`));
    return {};
  }
}

async function safelyRunAsync(label, errors, action) {
  try {
    return await action();
  } catch (error) {
    errors.push(formatError(error, 'PHASE_FAILED', { phase: 'utility' }, `${label} failed`));
    return {};
  }
}

function formatError(error, code = 'PHASE_FAILED', meta = {}, prefix = '') {
  const message = getErrorMessage(error);
  return createError(code, prefix ? `${prefix}: ${message}` : message, meta);
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export default Scanner;
