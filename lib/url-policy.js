import net from 'node:net';

const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const LOCAL_HOSTNAMES = new Set(['localhost', 'localhost.localdomain']);
const MAX_CORS_ENDPOINTS = 50;

export function assertAllowedTargetUrl(value) {
  const url = parseUrl(value);
  assertAllowedUrl(url, 'target URL');
  return url.toString();
}

export function isAllowedUrl(value) {
  try {
    assertAllowedUrl(parseUrl(value), 'URL');
    return true;
  } catch {
    return false;
  }
}

export function isSameOriginAllowedUrl(value, targetUrl) {
  try {
    const url = parseUrl(value, targetUrl);
    const target = parseUrl(targetUrl);
    assertAllowedUrl(url, 'endpoint URL');
    return url.origin === target.origin;
  } catch {
    return false;
  }
}

export function resolveAllowedSameOriginUrl(value, targetUrl) {
  try {
    const url = parseUrl(value, targetUrl);
    return isSameOriginAllowedUrl(url, targetUrl) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function limitCorsEndpoints(endpoints) {
  return endpoints.slice(0, MAX_CORS_ENDPOINTS);
}

export function createRequestPolicy(targetUrl) {
  const normalizedTargetUrl = assertAllowedTargetUrl(targetUrl);
  return {
    targetUrl: normalizedTargetUrl,
    assertAllowed: (value, context) => assertAllowedUrl(parseUrl(value, normalizedTargetUrl), context),
    isAllowed: (value) => isAllowedUrl(value),
    isSameOrigin: (value) => isSameOriginAllowedUrl(value, normalizedTargetUrl),
    resolveSameOrigin: (value) => resolveAllowedSameOriginUrl(value, normalizedTargetUrl),
  };
}

function parseUrl(value, baseUrl) {
  try {
    return baseUrl ? new URL(String(value), baseUrl) : new URL(String(value));
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }
}

function assertAllowedUrl(url, context) {
  if (!HTTP_PROTOCOLS.has(url.protocol)) {
    throw new Error(`Disallowed ${context}: only http and https URLs are supported`);
  }

  if (url.username || url.password) {
    throw new Error(`Disallowed ${context}: credentials in URLs are not supported`);
  }

  const hostname = normalizeHostname(url.hostname);
  if (LOCAL_HOSTNAMES.has(hostname) || isDeniedIpAddress(hostname)) {
    throw new Error(`Disallowed ${context}: private, loopback, link-local, and metadata addresses are blocked`);
  }
}

function normalizeHostname(hostname) {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

function isDeniedIpAddress(hostname) {
  const family = net.isIP(hostname);
  if (family === 4) {
    return isDeniedIpv4(hostname);
  }

  if (family === 6) {
    return isDeniedIpv6(hostname);
  }

  return false;
}

function isDeniedIpv4(hostname) {
  const parts = hostname.split('.').map((part) => Number.parseInt(part, 10));
  const [first, second] = parts;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isDeniedIpv6(hostname) {
  const value = hostname.toLowerCase();
  return value === '::1' || value === '::' || value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd');
}
