import type { ApiConfidence, ApiEndpoint, NormalizedApi, ScanResponse } from '../types';

export const PHASES = ['sourcemap', 'window', 'chunks', 'metadata', 'dynamic', 'graphql', 'serviceworker', 'phantom'] as const;

export const QUICK_PHASES = new Set<string>(['sourcemap', 'window', 'metadata']);

export const SOURCE_LABELS: Record<string, string> = {
  sourcemap: 'sourcemap',
  window: 'window',
  chunk: 'chunk',
  chunks: 'chunk',
  metadata: 'metadata',
  dynamic: 'dynamic',
  graphql: 'graphql',
  serviceworker: 'serviceworker',
  'service-worker': 'serviceworker',
  phantom: 'phantom',
  docs: 'metadata',
  unknown: 'unknown',
};

export const SOURCE_CLASS_NAMES: Record<string, string> = {
  sourcemap: 'border-phase-sourcemap text-phase-sourcemap bg-phase-sourcemap/10',
  window: 'border-phase-window text-phase-window bg-phase-window/10',
  chunk: 'border-phase-chunk text-phase-chunk bg-phase-chunk/10',
  chunks: 'border-phase-chunk text-phase-chunk bg-phase-chunk/10',
  metadata: 'border-phase-metadata text-phase-metadata bg-phase-metadata/10',
  dynamic: 'border-phase-dynamic text-phase-dynamic bg-phase-dynamic/10',
  graphql: 'border-phase-graphql text-phase-graphql bg-phase-graphql/10',
  serviceworker: 'border-phase-serviceworker text-phase-serviceworker bg-phase-serviceworker/10',
  phantom: 'border-phase-phantom text-phase-phantom bg-phase-phantom/10',
  docs: 'border-phase-docs text-phase-docs bg-phase-docs/10',
  unknown: 'border-phase-unknown text-phase-unknown bg-phase-unknown/10',
};

export const METHOD_CLASS_NAMES: Record<string, string> = {
  GET: 'border-terminal-green text-terminal-green bg-terminal-green/10',
  POST: 'border-terminal-blue text-terminal-blue bg-terminal-blue/10',
  PUT: 'border-terminal-orange text-terminal-orange bg-terminal-orange/10',
  PATCH: 'border-terminal-amber text-terminal-amber bg-terminal-amber/10',
  DELETE: 'border-terminal-red text-terminal-red bg-terminal-red/10',
  OPTIONS: 'border-terminal-muted text-terminal-muted bg-terminal-muted/10',
  HEAD: 'border-terminal-muted text-terminal-muted bg-terminal-muted/10',
  UNKNOWN: 'border-terminal-muted text-terminal-muted bg-terminal-muted/10',
};

export function normalizeReportApis(report: ScanResponse | null): NormalizedApi[] {
  if (!report) {
    return [];
  }

  return [...normalizeApiArray(report.buriedApis || [], 'buried'), ...normalizeApiArray(report.surfaceApis || [], 'surface')];
}

export function createCurlCommand(api: ApiEndpoint, target?: string): string {
  if (api.sampleRequest) {
    return api.sampleRequest;
  }

  const method = normalizeMethod(api.method || 'GET');
  const url = resolveEndpointUrl(api.path || api.url || api.endpoint || '', target);
  const lines = [`curl -X ${method} '${escapeSingleQuotes(url)}'`, "  -H 'Accept: application/json'"];

  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    lines.push("  -H 'Content-Type: application/json'", "  --data '{}'");
  }

  const lineContinuation = [' \\', ''].join('\n');
  return lines.join(lineContinuation);
}

export function createMarkdownReport(target: string, surfaceApis: ApiEndpoint[], buriedApis: ApiEndpoint[]): string {
  const allApis = [...buriedApis, ...surfaceApis];
  const lines = [
    '# APIR Scan Findings',
    '',
    `- Target: ${target || 'Unknown'}`,
    `- Surface APIs: ${surfaceApis.length}`,
    `- Buried APIs: ${buriedApis.length}`,
    `- Total APIs: ${allApis.length}`,
    '',
    '## Buried APIs',
    '',
  ];

  appendApiSection(lines, buriedApis, target);
  lines.push('', '## Surface APIs', '');
  appendApiSection(lines, surfaceApis, target);

  return lines.join('\n');
}

export function getSourceKey(source?: string): string {
  const normalizedSource = String(source || 'unknown').toLowerCase();
  const matchedKey = Object.keys(SOURCE_LABELS).find((key) => normalizedSource.includes(key));
  return matchedKey ? SOURCE_LABELS[matchedKey] : 'unknown';
}

export function getSourceClasses(source?: string): string {
  return SOURCE_CLASS_NAMES[getSourceKey(source)] || SOURCE_CLASS_NAMES.unknown;
}

export function getMethodClasses(method?: string): string {
  return METHOD_CLASS_NAMES[normalizeMethod(method)] || METHOD_CLASS_NAMES.UNKNOWN;
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'not reported';
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatValue(item)).join(', ');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

export function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function normalizeMethod(method?: string): string {
  return String(method || 'UNKNOWN').toUpperCase();
}

export function sanitizeFileName(value: string): string {
  return String(value || 'apir-scan')
    .replace(/^https?:\/\//i, '')
    .replace(/[^a-z0-9.-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function normalizeApiArray(apis: ApiEndpoint[], category: NormalizedApi['category']): NormalizedApi[] {
  return apis.map((api, index) => {
    const method = normalizeMethod(api.method);
    const path = normalizePath(api.path || api.endpoint || api.url || 'unknown-path');
    const source = getSourceKey(api.source || api.sources?.[0]);
    const confidence = normalizeConfidence(api.confidence, api);

    return {
      ...api,
      id: `${category}:${method}:${path}:${source}:${index}`,
      path,
      method,
      source,
      confidence,
      category,
    };
  });
}

function normalizeConfidence(confidence: unknown, api: ApiEndpoint): ApiConfidence {
  if (confidence === 'high' || confidence === 'medium' || confidence === 'low') {
    return confidence;
  }

  if (api.evidence || api.sampleRequest) {
    return 'medium';
  }

  return 'unknown';
}

function normalizePath(value: string): string {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}` || url.href;
  } catch {
    return value;
  }
}

function resolveEndpointUrl(path: string, target?: string): string {
  try {
    return new URL(path).toString();
  } catch {
    try {
      return new URL(path, target).toString();
    } catch {
      return path;
    }
  }
}

function escapeSingleQuotes(value: string): string {
  return String(value).replace(/'/g, "'\\''");
}

function appendApiSection(lines: string[], apis: ApiEndpoint[], target: string): void {
  if (apis.length === 0) {
    lines.push('No APIs were discovered.', '');
    return;
  }

  for (const api of apis) {
    lines.push(`### ${normalizeMethod(api.method)} ${api.path || api.endpoint || api.url || 'unknown-path'}`);
    lines.push('');
    lines.push(`- Source: ${api.source || 'unknown'}`);
    lines.push(`- Confidence: ${api.confidence || 'unknown'}`);
    lines.push(`- Found in: ${formatValue(api.foundIn)}`);

    if (api.note) {
      lines.push(`- Note: ${api.note}`);
    }

    lines.push('', '```bash', createCurlCommand(api, target), '```', '');
  }
}
