import { analyzeJWT } from '../lib/jwt-analyzer.js';

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createJwt(payload) {
  return `${base64UrlEncode({ alg: 'HS256', typ: 'JWT' })}.${base64UrlEncode(payload)}.signature`;
}

describe('analyzeJWT', () => {
  test('extracts JWTs recursively and decodes header, payload, signature, and expiration', () => {
    const token = createJwt({ sub: 'user-1', exp: 1893456000 });

    const result = analyzeJWT({ nested: { authorization: `Bearer ${token}` } });

    expect(result.tokens).toEqual([
      expect.objectContaining({
        header: { alg: 'HS256', typ: 'JWT' },
        payload: { sub: 'user-1', exp: 1893456000 },
        signature: 'signature',
        expiresAt: '2030-01-01T00:00:00.000Z',
        source: '$.nested.authorization',
      }),
    ]);
  });

  test('deduplicates tokens by source and ignores invalid token-looking strings', () => {
    const token = createJwt({ sub: 'user-1' });

    const result = analyzeJWT({ first: `${token} ${token}`, second: 'eyJbad.eyJbad.not-json' });

    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0]).toEqual(expect.objectContaining({ source: '$.first', expiresAt: null }));
  });

  test('handles circular input without recursion errors', () => {
    const data = { token: createJwt({ role: 'admin' }) };
    data.self = data;

    const result = analyzeJWT(data);

    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].payload.role).toBe('admin');
  });
});
