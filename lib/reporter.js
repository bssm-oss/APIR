const PHASE_NAMES = ['sourcemap', 'window', 'chunks', 'metadata', 'dynamic', 'graphql', 'serviceworker', 'phantom'];
const DOCUMENTATION_EVIDENCE_PATTERN = /swagger|openapi|api-docs|redoc|structured api documentation/i;

export function generateReport(targetUrl, scanResults = {}) {
  const target = targetUrl ?? scanResults.targetUrl ?? '';
  const phases = scanResults.phases ?? {};
  const surfaceApis = dedupeApis(collectSurfaceApis(phases));
  const buriedApis = dedupeApis(collectBuriedApis(phases));
  const totalEndpoints = dedupeApis([...surfaceApis, ...buriedApis]).length;
  const documentedEndpoints = surfaceApis.length;
  const riskScore = totalEndpoints === 0 ? 0 : Math.round(100 - (documentedEndpoints / totalEndpoints) * 100);

  return {
    target,
    scanTime: new Date().toISOString(),
    surfaceApis,
    buriedApis,
    schemaInference: collectSchemaInference(scanResults, phases),
    jwtAnalysis: normalizeJwtAnalysis(scanResults.jwtTokens),
    corsReport: normalizeArray(scanResults.corsResults?.vulnerable ?? scanResults.corsResults),
    serverFingerprint: scanResults.serverFingerprint ?? {},
    riskScore,
  };
}

function collectSurfaceApis(phases) {
  const documentedApis = [];

  for (const phase of Object.values(phases)) {
    for (const api of normalizeArray(phase?.apis)) {
      if (isDocumentedApi(api)) {
        documentedApis.push(...extractOpenApiEndpoints(api?.metadata?.schema ?? api?.schema));
      }
    }

    for (const schema of Object.values(phase?.metadata?.discoveredDocs ?? {})) {
      documentedApis.push(...extractOpenApiEndpoints(schema));
    }
  }

  return documentedApis;
}

function collectBuriedApis(phases) {
  const buriedApis = [];

  for (const phaseName of PHASE_NAMES) {
    const phase = phases[phaseName];

    for (const api of normalizeArray(phase?.apis)) {
      if (!isDocumentedApi(api)) {
        buriedApis.push(normalizeApi(api, phaseName));
      }
    }
  }

  return buriedApis;
}

function collectSchemaInference(scanResults, phases) {
  return scanResults.schemaInference ?? phases.graphql?.schemaInference ?? phases.graphql?.metadata ?? {};
}

function normalizeArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function normalizeJwtAnalysis(jwtTokens) {
  if (Array.isArray(jwtTokens)) {
    return jwtTokens;
  }

  return normalizeArray(jwtTokens?.tokens ?? jwtTokens);
}

function isDocumentedApi(api) {
  const evidence = String(api?.evidence ?? api?.source ?? api?.foundIn ?? '');
  const url = String(api?.url ?? api?.endpoint ?? api?.path ?? '');

  return DOCUMENTATION_EVIDENCE_PATTERN.test(evidence) || /\/(swagger|openapi|api-docs|redoc)(\.json)?(?:$|[/?#])/i.test(url);
}

function normalizeApi(api, fallbackSource) {
  const rawPath = api?.path ?? api?.endpoint ?? api?.url ?? '';
  const method = String(api?.method ?? 'UNKNOWN').toUpperCase();

  return {
    ...api,
    method,
    path: normalizePath(rawPath),
    source: api?.source ?? fallbackSource,
  };
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

function dedupeApis(apis) {
  const seen = new Set();
  const deduped = [];

  for (const api of apis) {
    const key = `${api.path}|${api.method}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(api);
  }

  return deduped;
}

function extractOpenApiEndpoints(schema) {
  const parsedSchema = parseSchema(schema);
  const paths = parsedSchema?.paths;

  if (!paths || typeof paths !== 'object') {
    return [];
  }

  const apis = [];

  for (const [path, operations] of Object.entries(paths)) {
    if (!operations || typeof operations !== 'object') {
      continue;
    }

    for (const [method, operation] of Object.entries(operations)) {
      if (!isHttpMethod(method)) {
        continue;
      }

      apis.push({
        method: method.toUpperCase(),
        path,
        source: 'docs',
        schema: operation,
      });
    }
  }

  return apis;
}

function parseSchema(schema) {
  if (typeof schema === 'string') {
    try {
      return JSON.parse(schema);
    } catch {
      return null;
    }
  }

  return schema;
}

function isHttpMethod(value) {
  return ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'].includes(value.toLowerCase());
}

export default generateReport;
