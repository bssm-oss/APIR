export function fingerprint(responseHeaders) {
  const serverHeader = getHeader(responseHeaders, 'server') ?? '';
  const poweredByHeader = getHeader(responseHeaders, 'x-powered-by') ?? '';
  const cfViaHeader = getHeader(responseHeaders, 'x-cf-via') ?? '';
  const server = parseSoftware(serverHeader);
  const framework = parseFramework(poweredByHeader);
  const via = parseVia(cfViaHeader);
  const estimatedStack = [server, framework, via].filter(Boolean).join(' + ');

  return { server, framework, via, estimatedStack };
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

function parseSoftware(value) {
  const software = String(value).split(/\s+/)[0]?.trim() ?? '';
  const match = software.match(/^([^/]+)(?:\/(.+))?$/);

  if (!match) {
    return software;
  }

  return match[2] ? `${match[1]} ${match[2]}` : match[1];
}

function parseFramework(value) {
  return String(value).split(',')[0]?.trim() ?? '';
}

function parseVia(value) {
  if (!value) {
    return '';
  }

  return /cloudflare/i.test(String(value)) ? `Cloudflare (${value})` : String(value).trim();
}

export default fingerprint;
