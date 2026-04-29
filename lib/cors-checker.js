import axios from 'axios';

import { isAllowedUrl } from './url-policy.js';

const TEST_ORIGIN = 'https://evil.com';

export async function checkCORS(endpoints, httpClient = axios, { requestPolicy } = {}) {
  const vulnerable = [];
  const skipped = [];

  for (const endpoint of normalizeEndpoints(endpoints)) {
    const allowed = requestPolicy ? requestPolicy.isSameOrigin(endpoint) : isAllowedUrl(endpoint);
    if (!allowed) {
      skipped.push({ endpoint, reason: 'disallowed_url' });
      continue;
    }

    const responses = [
      await sendRequest(httpClient, 'OPTIONS', endpoint),
      await sendRequest(httpClient, 'GET', endpoint),
    ];

    for (const response of responses) {
      const acao = getHeader(response?.headers, 'access-control-allow-origin');

      if (acao === '*' || acao === TEST_ORIGIN) {
        vulnerable.push({ endpoint, origin: TEST_ORIGIN, acao });
        break;
      }
    }
  }

  return { vulnerable, skipped };
}

function normalizeEndpoints(endpoints) {
  const values = Array.isArray(endpoints) ? endpoints : [endpoints];

  return values
    .map((endpoint) => {
      if (typeof endpoint === 'string') {
        return endpoint;
      }

      return endpoint?.url ?? endpoint?.endpoint ?? endpoint?.path ?? null;
    })
    .filter(Boolean);
}

async function sendRequest(httpClient, method, endpoint) {
  const options = {
    headers: { Origin: TEST_ORIGIN },
    method,
    url: endpoint,
    validateStatus: () => true,
  };

  try {
    if (typeof httpClient.request === 'function') {
      return await httpClient.request(options);
    }

    if (method === 'OPTIONS' && typeof httpClient.options === 'function') {
      return await httpClient.options(endpoint, options);
    }

    if (method === 'GET' && typeof httpClient.get === 'function') {
      return await httpClient.get(endpoint, options);
    }
  } catch (error) {
    return error.response ?? null;
  }

  return null;
}

function getHeader(headers, name) {
  if (!headers) {
    return null;
  }

  if (typeof headers.get === 'function') {
    return headers.get(name) ?? headers.get(name.toLowerCase()) ?? headers.get(name.toUpperCase()) ?? null;
  }

  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  const value = entry?.[1];

  return Array.isArray(value) ? value.join(', ') : value ?? null;
}

export default checkCORS;
