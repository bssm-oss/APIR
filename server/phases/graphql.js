import axios from 'axios';

import { createError } from '../scanner.js';

const GRAPHQL_INTROSPECTION_QUERY = '{ __schema { types { name kind fields { name type { name kind } } } } }';
const TYPENAME_SNIPPET_PATTERN = /.{0,120}__typename.{0,120}/gs;

function resolveDefaultGraphQLUrl(targetUrl) {
  const baseUrl = new URL(targetUrl);
  return new URL('/graphql', baseUrl.origin).toString();
}

function resolveGraphQLUrls(targetUrl, customPaths) {
  const urls = [resolveDefaultGraphQLUrl(targetUrl)];

  for (const customPath of customPaths) {
    try {
      const graphqlUrl = new URL(customPath, targetUrl).toString();
      if (!urls.includes(graphqlUrl)) {
        urls.push(graphqlUrl);
      }
    } catch (_error) {
      continue;
    }
  }

  return urls;
}

function createApiRecord(url, confidence, evidence, extraMetadata = {}) {
  return {
    url,
    source: 'graphql',
    confidence,
    evidence,
    metadata: extraMetadata,
  };
}

async function postIntrospection(httpClient, graphqlUrl) {
  try {
    const response = await httpClient.post(graphqlUrl, { query: GRAPHQL_INTROSPECTION_QUERY });
    return { status: response.status ?? 200, data: response.data, error: null };
  } catch (error) {
    return {
      status: error.response?.status ?? null,
      data: error.response?.data ?? null,
      error,
    };
  }
}

async function getIntrospection(httpClient, graphqlUrl) {
  try {
    const response = await httpClient.get(graphqlUrl, {
      params: { query: GRAPHQL_INTROSPECTION_QUERY },
    });
    return { status: response.status ?? 200, data: response.data, error: null };
  } catch (error) {
    return {
      status: error.response?.status ?? null,
      data: error.response?.data ?? null,
      error,
    };
  }
}

function extractSchema(responseData) {
  if (!responseData) {
    return null;
  }

  if (responseData.data?.__schema) {
    return responseData.data.__schema;
  }

  if (responseData.__schema) {
    return responseData.__schema;
  }

  return null;
}

function stringifySchema(schema) {
  return schema ? JSON.stringify(schema) : null;
}

function collectJavaScriptSources(node, sources = []) {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectJavaScriptSources(item, sources);
    }
    return sources;
  }

  if (!node || typeof node !== 'object') {
    return sources;
  }

  const path = node.path ?? node.file ?? node.name ?? node.url ?? '';
  const content = node.sourceContent ?? node.content ?? node.code ?? node.source ?? null;
  if (typeof content === 'string' && (!path || /\.(m?js|jsx|ts|tsx)(\?|$)/i.test(path) || content.includes('__typename'))) {
    sources.push(content);
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') {
      collectJavaScriptSources(value, sources);
    }
  }

  return sources;
}

function extractTypenameFragments(phaseOutput) {
  const fragments = new Set();
  const sources = collectJavaScriptSources(phaseOutput);

  for (const source of sources) {
    for (const match of source.matchAll(TYPENAME_SNIPPET_PATTERN)) {
      fragments.add(match[0].replace(/\s+/g, ' ').trim());
    }
  }

  return [...fragments];
}

export async function analyzeGraphQL(targetUrl, httpClient = axios, sourcemapPhaseOutput = {}, customPaths = []) {
  const apis = [];
  const errors = [];
  const graphqlUrls = resolveGraphQLUrls(targetUrl, customPaths);
  let fullSchema = null;
  let introspectionPossible = false;

  for (const graphqlUrl of graphqlUrls) {
    const postResponse = await postIntrospection(httpClient, graphqlUrl);
    let schema = postResponse.status === 200 ? extractSchema(postResponse.data) : null;

    if (!schema) {
      if (postResponse.error && postResponse.status !== 404) {
        errors.push(createPhaseError('FETCH_FAILED', `graphql POST introspection failed: ${formatError(postResponse.error)}`));
      }

      const getResponse = await getIntrospection(httpClient, graphqlUrl);
      schema = getResponse.status === 200 ? extractSchema(getResponse.data) : null;
      if (!schema && getResponse.error && getResponse.status !== 404) {
        errors.push(createPhaseError('FETCH_FAILED', `graphql GET introspection failed: ${formatError(getResponse.error)}`));
      }
    }

    if (schema) {
      introspectionPossible = true;
      fullSchema = stringifySchema(schema);
      apis.push(createApiRecord(graphqlUrl, 'high', 'graphql introspection schema', { schema }));
    }
  }

  const typenameFragments = extractTypenameFragments(sourcemapPhaseOutput);
  for (const fragment of typenameFragments) {
    apis.push(createApiRecord(graphqlUrls[0], 'medium', 'sourcemap __typename fragment', { fragment }));
  }

  const schemaInference = {
    graphql: introspectionPossible || typenameFragments.length > 0,
    introspectionPossible,
    fullSchema,
    typenameFragments,
  };

  return {
    apis,
    errors,
    metadata: schemaInference,
    schemaInference,
  };
}

export default analyzeGraphQL;

function createPhaseError(code, message) {
  return createError(code, message, { phase: 'graphql' });
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
