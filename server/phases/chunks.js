import axios from 'axios';
import * as acorn from 'acorn';
import * as cheerio from 'cheerio';

const SENSITIVE_CHUNK_TERMS = ['admin', 'dashboard', 'settings', 'billing', 'internal'];
const API_PATTERNS = [
  /https?:\/\/[^\s"'`<>]+\/(?:api|graphql|rest|v\d+)\/?[^\s"'`<>]*/gi,
  /["'`]((?:\/|\.\/|\.\.\/)(?:api|graphql|rest|v\d+)\/?[^"'`\s<>]*)["'`]/gi,
  /["'`]((?:\/|\.\/|\.\.\/)[^"'`\s<>]*(?:api|graphql|endpoint|rpc)[^"'`\s<>]*)["'`]/gi,
];

export async function analyzeChunks(targetUrl, httpClient = axios) {
  const apis = [];
  const errors = [];
  const metadata = {
    scriptsAnalyzed: 0,
    chunksDiscovered: 0,
    chunksAnalyzed: 0,
  };

  let baseUrl;
  try {
    baseUrl = new URL(targetUrl);
  } catch (error) {
    return {
      apis,
      errors: [`Invalid target URL: ${error.message}`],
      metadata,
    };
  }

  let html;
  try {
    html = await fetchText(targetUrl, httpClient);
  } catch (error) {
    return {
      apis,
      errors: [`Failed to fetch main HTML: ${error.message}`],
      metadata,
    };
  }

  const scriptUrls = extractScriptUrls(html, baseUrl.href);
  const chunkUrls = new Set();

  for (const scriptUrl of scriptUrls) {
    let scriptContent;
    try {
      scriptContent = await fetchText(scriptUrl, httpClient);
      metadata.scriptsAnalyzed += 1;
    } catch (error) {
      errors.push(`Failed to fetch script ${scriptUrl}: ${error.message}`);
      continue;
    }

    try {
      const ast = acorn.parse(scriptContent, {
        ecmaVersion: 2022,
        sourceType: 'module',
        allowHashBang: true,
      });

      for (const chunkSpecifier of findDynamicImports(ast)) {
        const chunkUrl = resolveAssetUrl(chunkSpecifier, scriptUrl);
        if (chunkUrl) {
          chunkUrls.add(chunkUrl);
        }
      }
    } catch (error) {
      errors.push(`Failed to parse script ${scriptUrl}: ${error.message}`);
    }
  }

  metadata.chunksDiscovered = chunkUrls.size;

  const seenApis = new Set();
  for (const chunkUrl of chunkUrls) {
    let chunkContent;
    try {
      chunkContent = await fetchText(chunkUrl, httpClient);
      metadata.chunksAnalyzed += 1;
    } catch (error) {
      errors.push(`Failed to fetch chunk ${chunkUrl}: ${error.message}`);
      continue;
    }

    const sensitive = isSensitiveChunk(chunkUrl);
    for (const endpoint of extractApiLikeUrls(chunkContent)) {
      const resolvedEndpoint = resolveApiUrl(endpoint, baseUrl.href);
      const dedupeKey = `${chunkUrl}:${resolvedEndpoint}`;
      if (seenApis.has(dedupeKey)) {
        continue;
      }

      seenApis.add(dedupeKey);
      apis.push({
        url: resolvedEndpoint,
        source: 'chunk',
        confidence: sensitive ? 'high' : 'medium',
        evidence: {
          chunkUrl,
          sensitiveChunk: sensitive,
        },
      });
    }
  }

  return { apis, errors, metadata };
}

function extractScriptUrls(html, baseUrl) {
  const $ = cheerio.load(html);
  const scriptUrls = [];

  $('script[src]').each((_, element) => {
    const src = $(element).attr('src');
    const scriptUrl = resolveAssetUrl(src, baseUrl);
    if (scriptUrl) {
      scriptUrls.push(scriptUrl);
    }
  });

  return [...new Set(scriptUrls)];
}

async function fetchText(url, httpClient) {
  const response = await httpClient.get(url, {
    responseType: 'text',
    transformResponse: [(body) => body],
  });
  return typeof response.data === 'string' ? response.data : String(response.data ?? '');
}

function findDynamicImports(ast) {
  const imports = new Set();

  walkAst(ast, (node) => {
    if (node.type === 'ImportExpression') {
      addLiteralValue(imports, node.source);
      return;
    }

    if (node.type !== 'CallExpression') {
      return;
    }

    if (node.callee?.type === 'Import') {
      addLiteralValue(imports, node.arguments?.[0]);
      return;
    }

    if (isRequireEnsure(node)) {
      addRequireEnsureValue(imports, node.arguments?.[0]);
      return;
    }

    if (isReactLazy(node)) {
      addReactLazyImport(imports, node.arguments?.[0]);
    }
  });

  return [...imports];
}

function walkAst(root, visitor) {
  const stack = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node.type !== 'string') {
      continue;
    }

    visitor(node);

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (let index = value.length - 1; index >= 0; index -= 1) {
          if (value[index]?.type) {
            stack.push(value[index]);
          }
        }
      } else if (value?.type) {
        stack.push(value);
      }
    }
  }
}

function isRequireEnsure(node) {
  return (
    node.callee?.type === 'MemberExpression' &&
    node.callee.object?.type === 'Identifier' &&
    node.callee.object.name === 'require' &&
    getPropertyName(node.callee) === 'ensure'
  );
}

function isReactLazy(node) {
  return (
    node.callee?.type === 'MemberExpression' &&
    node.callee.object?.type === 'Identifier' &&
    node.callee.object.name === 'React' &&
    getPropertyName(node.callee) === 'lazy'
  );
}

function getPropertyName(memberExpression) {
  if (memberExpression.property?.type === 'Identifier') {
    return memberExpression.property.name;
  }
  if (memberExpression.property?.type === 'Literal') {
    return memberExpression.property.value;
  }
  return undefined;
}

function addLiteralValue(imports, node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    imports.add(node.value);
  }
}

function addRequireEnsureValue(imports, node) {
  if (node?.type === 'ArrayExpression') {
    for (const element of node.elements ?? []) {
      addLiteralValue(imports, element);
    }
    return;
  }

  addLiteralValue(imports, node);
}

function addReactLazyImport(imports, node) {
  if (!['ArrowFunctionExpression', 'FunctionExpression'].includes(node?.type)) {
    return;
  }

  const body = node.body?.type === 'BlockStatement' ? findReturnArgument(node.body) : node.body;
  if (body?.type === 'ImportExpression') {
    addLiteralValue(imports, body.source);
  } else if (body?.type === 'CallExpression' && body.callee?.type === 'Import') {
    addLiteralValue(imports, body.arguments?.[0]);
  }
}

function findReturnArgument(blockStatement) {
  const returnStatement = blockStatement.body?.find((statement) => statement.type === 'ReturnStatement');
  return returnStatement?.argument;
}

function resolveAssetUrl(value, baseUrl) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}

function resolveApiUrl(value, baseUrl) {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
}

function extractApiLikeUrls(content) {
  const endpoints = new Set();

  for (const pattern of API_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(content);
    while (match) {
      endpoints.add(cleanEndpoint(match[1] ?? match[0]));
      match = pattern.exec(content);
    }
  }

  return [...endpoints].filter(Boolean);
}

function cleanEndpoint(endpoint) {
  return endpoint.replace(/[),.;]+$/g, '');
}

function isSensitiveChunk(chunkUrl) {
  const lowerChunkUrl = chunkUrl.toLowerCase();
  return SENSITIVE_CHUNK_TERMS.some((term) => lowerChunkUrl.includes(term));
}
