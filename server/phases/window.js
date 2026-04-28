import vm from 'node:vm';
import axios from 'axios';
import * as cheerio from 'cheerio';

import { createError } from '../scanner.js';

const FRAMEWORK_STATE_KEYS = [
  '__NUXT__',
  '__NEXT_DATA__',
  '__INITIAL_STATE__',
  '__initialState__',
  '__INITIALSTATE__',
  '__initialstate__',
  'initialState',
  'INITIAL_STATE',
  '__APOLLO_STATE__',
  '__REDUX_STATE__',
];

const API_PATTERNS = [/\/api\//i, /https:\/\/api\./i, /graphql/i, /endpoint/i];
const SCRIPT_TIMEOUT_MS = 50;

export async function harvestWindowObject(targetUrl, httpClient = axios) {
  const apis = [];
  const errors = [];
  const frameworkState = {};

  try {
    const response = await httpClient.get(targetUrl);
    const html = response.data ?? '';
    const scriptBlocks = extractScriptBlocks(html);
    const sandbox = createSandbox(targetUrl);

    for (const scriptBlock of scriptBlocks) {
      if (scriptBlock.isJson) {
        captureJsonScript(scriptBlock, sandbox, errors);
        continue;
      }

      executeInlineScript(scriptBlock.content, sandbox, errors);
    }

    for (const key of FRAMEWORK_STATE_KEYS) {
      try {
        if (!Object.prototype.hasOwnProperty.call(sandbox, key)) {
          continue;
        }

        const state = sandbox[key];
        frameworkState[key] = cloneForMetadata(state);
        collectApiMatches(state, key, apis);
      } catch (error) {
        errors.push(createPhaseError('SCRIPT_EXECUTION_FAILED', `failed to access ${key}: ${formatSandboxError(error)}`));
      }
    }
  } catch (error) {
    errors.push(createPhaseError('PHASE_FAILED', `window harvest failed: ${formatSandboxError(error)}`));
  }

  return {
    apis: dedupeApis(apis),
    errors,
    metadata: { frameworkState },
  };
}

function extractScriptBlocks(html) {
  const $ = cheerio.load(html);
  const scriptBlocks = [];

  $('script').each((index, element) => {
    const script = $(element);
    const content = script.html()?.trim();

    if (!content) {
      return;
    }

    const type = script.attr('type')?.toLowerCase() ?? '';
    const id = script.attr('id') ?? '';

    scriptBlocks.push({
      content,
      id,
      index,
      isJson: type.includes('json'),
      type,
    });
  });

  return scriptBlocks;
}

function createSandbox(targetUrl) {
  const parsedUrl = new URL(targetUrl);
  const sandboxPrototype = Object.create(null);
  const sandbox = Object.assign(Object.create(sandboxPrototype), {
    FinalizationRegistry: undefined,
    Function: undefined,
    Proxy: undefined,
    Symbol: undefined,
    URL,
    URLSearchParams,
    WeakRef: undefined,
    atob: (value) => Buffer.from(String(value), 'base64').toString('binary'),
    btoa: (value) => Buffer.from(String(value), 'binary').toString('base64'),
    console: Object.assign(Object.create(null), {
      debug() {},
      error() {},
      info() {},
      log() {},
      warn() {},
    }),
    document: createDocumentStub(),
    history: Object.create(null),
    location: Object.assign(Object.create(null), {
      hash: parsedUrl.hash,
      host: parsedUrl.host,
      hostname: parsedUrl.hostname,
      href: parsedUrl.href,
      origin: parsedUrl.origin,
      pathname: parsedUrl.pathname,
      port: parsedUrl.port,
      protocol: parsedUrl.protocol,
      search: parsedUrl.search,
      toString() {
        return parsedUrl.href;
      },
    }),
    localStorage: createStorageStub(),
    navigator: Object.assign(Object.create(null), { userAgent: 'APIR Window Harvester' }),
    sessionStorage: createStorageStub(),
    setInterval() {
      return 0;
    },
    setTimeout() {
      return 0;
    },
    clearInterval() {},
    clearTimeout() {},
  });

  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;

  return vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
    name: 'apir-window-harvest',
  });
}

function createDocumentStub() {
  const element = Object.assign(Object.create(null), {
    addEventListener() {},
    appendChild() {},
    getAttribute() {
      return null;
    },
    removeChild() {},
    setAttribute() {},
    style: Object.create(null),
  });

  return Object.assign(Object.create(null), {
    addEventListener() {},
    body: element,
    createElement() {
      return Object.assign(Object.create(null), element, { style: Object.create(null) });
    },
    currentScript: null,
    documentElement: element,
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  });
}

function createStorageStub() {
  const values = new Map();

  return Object.assign(Object.create(null), {
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(String(key)) ?? null;
    },
    removeItem(key) {
      values.delete(String(key));
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
  });
}

function captureJsonScript(scriptBlock, sandbox, errors) {
  try {
    const parsedJson = JSON.parse(scriptBlock.content);
    const stateKey = inferJsonStateKey(scriptBlock);

    if (stateKey) {
      sandbox[stateKey] = parsedJson;
    }
  } catch (error) {
    errors.push(createPhaseError('PARSE_FAILED', `script ${scriptBlock.index} JSON parse failed: ${formatSandboxError(error)}`));
  }
}

function inferJsonStateKey(scriptBlock) {
  if (FRAMEWORK_STATE_KEYS.includes(scriptBlock.id)) {
    return scriptBlock.id;
  }

  if (scriptBlock.id === '__NEXT_DATA__') {
    return '__NEXT_DATA__';
  }

  return null;
}

function executeInlineScript(content, sandbox, errors) {
  try {
    const script = new vm.Script(content, {
      displayErrors: false,
      filename: 'apir-sandbox-script.js',
      lineOffset: 0,
      produceCachedData: false,
    });
    script.runInContext(sandbox, {
      breakOnSigint: true,
      displayErrors: false,
      timeout: SCRIPT_TIMEOUT_MS,
    });
  } catch (error) {
    errors.push(createPhaseError('SCRIPT_EXECUTION_FAILED', `inline script skipped: ${formatSandboxError(error)}`));
  }
}

function createPhaseError(code, message) {
  return createError(code, message, { phase: 'window' });
}

function formatSandboxError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function collectApiMatches(value, foundIn, apis, path = foundIn, visited = new Set()) {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string') {
    if (API_PATTERNS.some((pattern) => pattern.test(value))) {
      apis.push({
        endpoint: value,
        source: 'window',
        confidence: 'medium',
        foundIn,
        path,
      });
    }

    return;
  }

  if (typeof value !== 'object') {
    return;
  }

  if (visited.has(value)) {
    return;
  }

  visited.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectApiMatches(item, foundIn, apis, `${path}[${index}]`, visited);
    });
    return;
  }

  for (const [key, childValue] of Object.entries(value)) {
    const childPath = `${path}.${key}`;

    if (API_PATTERNS.some((pattern) => pattern.test(key))) {
      apis.push({
        endpoint: String(childValue),
        source: 'window',
        confidence: 'medium',
        foundIn,
        path: childPath,
      });
    }

    collectApiMatches(childValue, foundIn, apis, childPath, visited);
  }
}

function dedupeApis(apis) {
  const seen = new Set();

  return apis.filter((api) => {
    const key = `${api.endpoint}|${api.foundIn}|${api.path}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function cloneForMetadata(value, visited = new Set()) {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (visited.has(value)) {
    return '[Circular]';
  }

  visited.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => cloneForMetadata(item, visited));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, childValue]) => [key, cloneForMetadata(childValue, visited)]),
  );
}
