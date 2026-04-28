import { jwtDecode } from 'jwt-decode';

const JWT_PATTERN = /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g;

export function analyzeJWT(data) {
  const tokens = [];
  const seenTokens = new Set();

  for (const { value, source } of collectStrings(data)) {
    for (const match of value.matchAll(JWT_PATTERN)) {
      const token = match[0];
      const tokenKey = `${source}:${token}`;

      if (seenTokens.has(tokenKey)) {
        continue;
      }

      seenTokens.add(tokenKey);

      try {
        const header = jwtDecode(token, { header: true });
        const payload = jwtDecode(token);
        const signature = token.split('.')[2] ?? '';
        const expiresAt = typeof payload.exp === 'number' ? new Date(payload.exp * 1000).toISOString() : null;

        tokens.push({ header, payload, signature, expiresAt, source });
      } catch {
        continue;
      }
    }
  }

  return { tokens };
}

function collectStrings(data, source = '$', visited = new Set()) {
  if (typeof data === 'string') {
    return [{ value: data, source }];
  }

  if (data === null || data === undefined || typeof data !== 'object') {
    return [];
  }

  if (visited.has(data)) {
    return [];
  }

  visited.add(data);

  if (Array.isArray(data)) {
    return data.flatMap((item, index) => collectStrings(item, `${source}[${index}]`, visited));
  }

  return Object.entries(data).flatMap(([key, value]) => collectStrings(value, `${source}.${key}`, visited));
}

export default analyzeJWT;
