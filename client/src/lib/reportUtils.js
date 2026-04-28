export const SOURCE_META = {
  sourcemap: { label: 'sourcemap' },
  window: { label: 'window' },
  chunk: { label: 'chunk' },
  metadata: { label: 'metadata' },
  dynamic: { label: 'dynamic' },
  phantom: { label: 'phantom' },
  serviceworker: { label: 'serviceworker' },
  graphql: { label: 'graphql' },
  docs: { label: 'docs' },
  unknown: { label: 'unknown' },
};

export const METHOD_META = {
  get: { label: 'GET' },
  post: { label: 'POST' },
  put: { label: 'PUT' },
  patch: { label: 'PATCH' },
  delete: { label: 'DELETE' },
  options: { label: 'OPTIONS' },
  head: { label: 'HEAD' },
  unknown: { label: 'UNKNOWN' },
};

export function normalizeApis(report) {
  if (!report) {
    return [];
  }

  return [...normalizeArray(report.surfaceApis), ...normalizeArray(report.buriedApis)].map((api, index) => {
    const method = String(api.method || 'UNKNOWN').toUpperCase();
    const path = normalizePath(api.path || api.endpoint || api.url || 'unknown-path');
    const source = normalizeSource(api.source || api.evidence || 'unknown');

    return {
      ...api,
      id: `${method}:${path}:${source}:${api.foundIn || api.evidence || index}`,
      method,
      path,
      source,
      confidence: api.confidence || inferConfidence(api),
    };
  });
}

export function createCurlCommand(api, target) {
  if (!api) {
    return '';
  }

  const method = String(api.method || 'GET').toUpperCase();
  const url = resolveEndpointUrl(api.path || api.url || api.endpoint || '', target);
  const lines = [`curl -X ${method} '${escapeSingleQuotes(url)}'`, "  -H 'Accept: application/json'"];
  const lineContinuation = ' \\' + '\n';

  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    lines.push("  -H 'Content-Type: application/json'", "  --data '{}'");
  }

  return lines.join(lineContinuation);
}

export function createMarkdownReport(report, apis) {
  const lines = [
    '# APIR Scan Findings',
    '',
    `- Target: ${report.target || 'Unknown'}`,
    `- Scan time: ${report.scanTime || 'Unknown'}`,
    `- Risk score: ${Number.isFinite(Number(report.riskScore)) ? Number(report.riskScore) : 0}/100`,
    `- Total APIs found: ${apis.length}`,
    '',
    '## Findings',
    '',
  ];

  if (apis.length === 0) {
    lines.push('No APIs were discovered.');
  }

  for (const api of apis) {
    lines.push(`### ${api.method} ${api.path}`);
    lines.push('');
    lines.push(`- Source: ${api.source || 'unknown'}`);
    lines.push(`- Confidence: ${api.confidence || 'unknown'}`);
    lines.push(`- Found in: ${api.foundIn || api.evidence || 'not reported'}`);

    for (const note of getNotes(api)) {
      lines.push(`- Note: ${note}`);
    }

    lines.push('');
    lines.push('```bash');
    lines.push(createCurlCommand(api, report.target));
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

export function getNotes(api) {
  return normalizeArray(api.note || api.notes || api.comment || api.comments).map((note) =>
    typeof note === 'string' ? note : JSON.stringify(note)
  );
}

export function getSourceKey(source) {
  const normalizedSource = normalizeSource(source);

  if (normalizedSource.includes('sourcemap')) {
    return 'sourcemap';
  }

  if (normalizedSource.includes('window')) {
    return 'window';
  }

  if (normalizedSource.includes('chunk')) {
    return 'chunk';
  }

  if (normalizedSource.includes('metadata')) {
    return 'metadata';
  }

  if (normalizedSource.includes('dynamic')) {
    return 'dynamic';
  }

  if (normalizedSource.includes('phantom')) {
    return 'phantom';
  }

  if (normalizedSource.includes('serviceworker') || normalizedSource.includes('service-worker')) {
    return 'serviceworker';
  }

  if (normalizedSource.includes('graphql')) {
    return 'graphql';
  }

  if (normalizedSource.includes('docs')) {
    return 'docs';
  }

  return 'unknown';
}

function normalizeArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function normalizePath(value) {
  const path = String(value);

  try {
    const url = new URL(path);
    return `${url.pathname}${url.search}` || url.href;
  } catch {
    return path;
  }
}

function normalizeSource(value) {
  return String(value || 'unknown').toLowerCase();
}

function inferConfidence(api) {
  if (api.schema || api.metadata?.schema) {
    return 'high';
  }

  if (api.foundIn || api.evidence) {
    return 'medium';
  }

  return 'unknown';
}

function resolveEndpointUrl(path, target) {
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

function escapeSingleQuotes(value) {
  return String(value).replace(/'/g, "'\\''");
}
