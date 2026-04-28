import * as cheerio from 'cheerio';
import { SourceMapConsumer } from 'source-map';

const API_LITERAL_PATTERNS = [
  { regex: /(["'`])(\/api[a-zA-Z0-9/_-]*)\1/g, method: 'UNKNOWN' },
  { regex: /(["'`])(\/graphql[a-zA-Z0-9/_-]*)\1/g, method: 'UNKNOWN' },
];

const CALL_PATTERNS = [
  { regex: /fetch\(["'`](.*?)["'`]\)/g, method: 'UNKNOWN', pathGroup: 1 },
  {
    regex: /axios\.(get|post|put|delete|patch)\(["'`](.*?)["'`]\)/g,
    methodGroup: 1,
    pathGroup: 2,
  },
];

const NOTE_PATTERN = /\b(TODO|FIXME|HACK)\b:?\s*(.*)/g;
const SOURCE_MAPPING_URL_PATTERN = /\/\/[#@]\s*sourceMappingURL\s*=\s*(\S+)\s*$/;

export async function extractSourceMaps(targetUrl, httpClient) {
  const errors = [];
  const apis = [];
  const client = httpClient ?? (await import('axios')).default;

  let html;
  try {
    const response = await client.get(targetUrl);
    html = String(response.data ?? '');
  } catch (error) {
    return {
      apis,
      errors: [`Failed to download HTML from ${targetUrl}: ${formatError(error)}`],
      metadata: { targetUrl, scriptsFound: 0, sourceMapsFound: 0, sourcesParsed: 0 },
    };
  }

  const scriptUrls = extractScriptUrls(html, targetUrl);
  let sourceMapsFound = 0;
  let sourcesParsed = 0;

  for (const scriptUrl of scriptUrls) {
    try {
      const scriptResponse = await client.get(scriptUrl);
      const scriptBody = String(scriptResponse.data ?? '');
      const sourceMapReference = findSourceMapReference(scriptBody);

      if (!sourceMapReference) {
        continue;
      }

      const sourceMap = await loadSourceMap(sourceMapReference, scriptUrl, client);
      sourceMapsFound += 1;

      await SourceMapConsumer.with(sourceMap, null, (consumer) => {
        for (const sourceName of consumer.sources) {
          const sourceContent = consumer.sourceContentFor(sourceName, true);

          if (!sourceContent) {
            errors.push(`Missing source content for ${sourceName} in ${scriptUrl}`);
            continue;
          }

          sourcesParsed += 1;
          apis.push(...extractApisFromSource(sourceContent, sourceName));
        }
      });
    } catch (error) {
      errors.push(`Failed to process source map for ${scriptUrl}: ${formatError(error)}`);
    }
  }

  return {
    apis: dedupeApis(apis),
    errors,
    metadata: {
      targetUrl,
      scriptsFound: scriptUrls.length,
      sourceMapsFound,
      sourcesParsed,
    },
  };
}

function extractScriptUrls(html, targetUrl) {
  const $ = cheerio.load(html);
  const urls = [];

  $('script[src]').each((_, element) => {
    const source = $(element).attr('src');

    if (!source) {
      return;
    }

    try {
      urls.push(new URL(source, targetUrl).toString());
    } catch {
      return;
    }
  });

  return [...new Set(urls)];
}

function findSourceMapReference(scriptBody) {
  const lines = scriptBody.trimEnd().split(/\r?\n/);
  const lastLine = lines.at(-1) ?? '';
  const match = lastLine.match(SOURCE_MAPPING_URL_PATTERN);

  return match?.[1] ?? null;
}

async function loadSourceMap(reference, scriptUrl, client) {
  if (reference.startsWith('data:')) {
    return parseDataSourceMap(reference);
  }

  const sourceMapUrl = new URL(reference, scriptUrl).toString();
  const response = await client.get(sourceMapUrl);
  return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
}

function parseDataSourceMap(reference) {
  const commaIndex = reference.indexOf(',');

  if (commaIndex === -1) {
    throw new Error('Invalid inline source map');
  }

  const metadata = reference.slice(0, commaIndex);
  const payload = reference.slice(commaIndex + 1);
  const json = metadata.endsWith(';base64')
    ? Buffer.from(payload, 'base64').toString('utf8')
    : decodeURIComponent(payload);

  return JSON.parse(json);
}

function extractApisFromSource(sourceContent, sourceName) {
  const apis = [];

  for (const pattern of API_LITERAL_PATTERNS) {
    for (const match of sourceContent.matchAll(pattern.regex)) {
      apis.push(createApi(pattern.method, match[2], sourceContent, match.index ?? 0, sourceName));
    }
  }

  for (const pattern of CALL_PATTERNS) {
    for (const match of sourceContent.matchAll(pattern.regex)) {
      const method = pattern.methodGroup ? match[pattern.methodGroup].toUpperCase() : pattern.method;
      const path = match[pattern.pathGroup];
      apis.push(createApi(method, path, sourceContent, match.index ?? 0, sourceName));
    }
  }

  for (const match of sourceContent.matchAll(NOTE_PATTERN)) {
    const noteText = [match[1], match[2]].filter(Boolean).join(': ').trim();
    apis.push(createApi('UNKNOWN', noteText, sourceContent, match.index ?? 0, sourceName, 'Recovered source comment'));
  }

  return apis.filter((api) => Boolean(api.path));
}

function createApi(method, path, sourceContent, matchIndex, sourceName, note) {
  return {
    source: 'sourcemap',
    confidence: 'high',
    method,
    path,
    headers: {},
    sampleRequest: null,
    foundIn: `${sourceName}:${getLineNumber(sourceContent, matchIndex)}`,
    note: note ?? 'Recovered from source map',
  };
}

function getLineNumber(sourceContent, index) {
  return sourceContent.slice(0, index).split(/\r?\n/).length;
}

function dedupeApis(apis) {
  const seen = new Set();

  return apis.filter((api) => {
    const key = `${api.method}|${api.path}|${api.foundIn}|${api.note}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
