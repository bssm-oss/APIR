import axios from 'axios';
import * as cheerio from 'cheerio';
import { parseStringPromise } from 'xml2js';

import { createError } from '../scanner.js';

const API_PATTERN = /\/api(?:\/|$)|\/v\d+(?:\/|$)/i;
const DOC_PATHS = ['/swagger.json', '/openapi.json', '/api-docs', '/redoc'];

function resolveTargetUrl(targetUrl, path = '') {
  const baseUrl = new URL(targetUrl);
  return new URL(path, baseUrl.origin).toString();
}

function createApiRecord(url, confidence, evidence, extraMetadata = {}) {
  return {
    url,
    source: 'metadata',
    confidence,
    evidence,
    metadata: extraMetadata,
  };
}

async function fetchText(httpClient, url, options = {}) {
  try {
    const response = await httpClient.get(url, options);
    return {
      status: response.status ?? 200,
      data: response.data,
      error: null,
    };
  } catch (error) {
    return {
      status: error.response?.status ?? null,
      data: error.response?.data ?? null,
      error,
    };
  }
}

function stringifyContent(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Buffer.isBuffer(content)) {
    return content.toString('utf8');
  }

  if (content == null) {
    return '';
  }

  return JSON.stringify(content);
}

function extractRobotsDisallows(robotsText) {
  const disallows = [];
  const disallowPattern = /^\s*Disallow\s*:\s*(\S*)\s*$/gim;
  let match;

  while ((match = disallowPattern.exec(robotsText)) !== null) {
    if (match[1]) {
      disallows.push(match[1]);
    }
  }

  return [...new Set(disallows)];
}

function collectSitemapLocs(node, urls = []) {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectSitemapLocs(item, urls);
    }
    return urls;
  }

  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc') {
        const locValues = Array.isArray(value) ? value : [value];
        for (const locValue of locValues) {
          if (typeof locValue === 'string') {
            urls.push(locValue);
          }
        }
      } else {
        collectSitemapLocs(value, urls);
      }
    }
  }

  return urls;
}

function parseJsonLd(scriptContent) {
  try {
    return JSON.parse(scriptContent);
  } catch (_error) {
    return null;
  }
}

function collectIdFields(node, ids = []) {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectIdFields(item, ids);
    }
    return ids;
  }

  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '@id' && typeof value === 'string') {
        ids.push(value);
      }
      collectIdFields(value, ids);
    }
  }

  return ids;
}

function addUniqueApi(apis, seenUrls, apiRecord) {
  const dedupeKey = `${apiRecord.url}:${apiRecord.evidence}`;
  if (!seenUrls.has(dedupeKey)) {
    seenUrls.add(dedupeKey);
    apis.push(apiRecord);
  }
}

export async function extractMetadata(targetUrl, httpClient = axios) {
  const apis = [];
  const errors = [];
  const seenUrls = new Set();
  const metadata = {
    robotsPaths: [],
    sitemapUrls: [],
    ldJsonData: [],
    openGraphData: [],
    discoveredDocs: {},
  };

  const robotsUrl = resolveTargetUrl(targetUrl, '/robots.txt');
  const robotsResponse = await fetchText(httpClient, robotsUrl, { responseType: 'text' });
  if (robotsResponse.status === 200) {
    metadata.robotsPaths = extractRobotsDisallows(stringifyContent(robotsResponse.data));
    for (const path of metadata.robotsPaths.filter((path) => API_PATTERN.test(path))) {
      addUniqueApi(
        apis,
        seenUrls,
        createApiRecord(resolveTargetUrl(targetUrl, path), 'medium', 'robots.txt disallow path', { path }),
      );
    }
  } else if (robotsResponse.error && robotsResponse.status !== 404) {
    errors.push(createPhaseError('FETCH_FAILED', `robots.txt fetch failed: ${formatError(robotsResponse.error)}`));
  }

  const sitemapUrl = resolveTargetUrl(targetUrl, '/sitemap.xml');
  const sitemapResponse = await fetchText(httpClient, sitemapUrl, { responseType: 'text' });
  if (sitemapResponse.status === 200) {
    try {
      const parsedSitemap = await parseStringPromise(stringifyContent(sitemapResponse.data));
      metadata.sitemapUrls = [...new Set(collectSitemapLocs(parsedSitemap))];
      for (const url of metadata.sitemapUrls.filter((url) => API_PATTERN.test(url))) {
        addUniqueApi(
          apis,
          seenUrls,
          createApiRecord(url, 'medium', 'sitemap.xml url', { sitemapUrl: url }),
        );
      }
    } catch (error) {
      errors.push(createPhaseError('PARSE_FAILED', `sitemap.xml parse failed: ${formatError(error)}`));
    }
  } else if (sitemapResponse.error && sitemapResponse.status !== 404) {
    errors.push(createPhaseError('FETCH_FAILED', `sitemap.xml fetch failed: ${formatError(sitemapResponse.error)}`));
  }

  const htmlResponse = await fetchText(httpClient, targetUrl, { responseType: 'text' });
  if (htmlResponse.status === 200) {
    const $ = cheerio.load(stringifyContent(htmlResponse.data));

    $('script[type="application/ld+json"]').each((_index, element) => {
      const parsedJson = parseJsonLd($(element).text());
      if (!parsedJson) {
        return;
      }

      metadata.ldJsonData.push(parsedJson);
      for (const id of collectIdFields(parsedJson).filter((id) => API_PATTERN.test(id))) {
        addUniqueApi(
          apis,
          seenUrls,
          createApiRecord(id, 'medium', 'json-ld @id', { id }),
        );
      }
    });

    $('meta[property^="og:"]').each((_index, element) => {
      const property = $(element).attr('property');
      const content = $(element).attr('content');
      if (!property || !content || !/(api|endpoint)/i.test(content)) {
        return;
      }

      const openGraphEntry = { property, content };
      metadata.openGraphData.push(openGraphEntry);
      addUniqueApi(
        apis,
        seenUrls,
        createApiRecord(content, 'medium', 'open graph api keyword', openGraphEntry),
      );
    });
  } else if (htmlResponse.error) {
    errors.push(createPhaseError('FETCH_FAILED', `html metadata fetch failed: ${formatError(htmlResponse.error)}`));
  }

  for (const docPath of DOC_PATHS) {
    const docUrl = resolveTargetUrl(targetUrl, docPath);
    const docResponse = await fetchText(httpClient, docUrl, { responseType: 'text' });
    if (docResponse.status !== 200) {
      if (docResponse.error && docResponse.status !== 404) {
        errors.push(createPhaseError('FETCH_FAILED', `${docPath} probe failed: ${formatError(docResponse.error)}`));
      }
      continue;
    }

    const schema = docResponse.data;
    metadata.discoveredDocs[docPath] = schema;
    addUniqueApi(
      apis,
      seenUrls,
      createApiRecord(docUrl, 'high', 'structured api documentation', { path: docPath, schema }),
    );
  }

  return { apis, errors, metadata };
}

export default extractMetadata;

function createPhaseError(code, message) {
  return createError(code, message, { phase: 'metadata' });
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
