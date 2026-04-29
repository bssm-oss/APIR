import { generateReport } from '../lib/reporter.js';

describe('generateReport', () => {
  test('separates documented surface APIs from buried APIs and deduplicates buried endpoints', () => {
    const report = generateReport('https://example.test', {
      phases: {
        metadata: {
          apis: [
            {
              url: 'https://example.test/swagger.json',
              evidence: 'structured api documentation',
              metadata: { schema: { paths: { '/api/users': { get: {}, post: {} } } } },
            },
          ],
        },
        sourcemap: {
          apis: [
            { path: '/api/hidden', method: 'get', source: 'sourcemap' },
            { endpoint: 'https://example.test/api/hidden', method: 'GET', source: 'window' },
            { path: '/api/admin', source: 'sourcemap' },
          ],
        },
      },
    });

    expect(report.surfaceApis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/api/users' }),
        expect.objectContaining({ method: 'POST', path: '/api/users' }),
      ]),
    );
    expect(report.buriedApis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/api/hidden' }),
        expect.objectContaining({ method: 'UNKNOWN', path: '/api/admin' }),
      ]),
    );
    expect(report.buriedApis.filter((api) => api.path === '/api/hidden')).toHaveLength(1);
  });

  test('merges source metadata when duplicate APIs are discovered across phases', () => {
    const report = generateReport('https://example.test', {
      phases: {
        sourcemap: {
          apis: [
            {
              path: '/api/hidden',
              method: 'GET',
              source: 'sourcemap',
              confidence: 'low',
              evidence: 'fetch("/api/hidden")',
              foundIn: 'app.js.map',
            },
          ],
        },
        dynamic: {
          apis: [
            {
              url: 'https://example.test/api/hidden',
              method: 'get',
              source: 'dynamic',
              confidence: 'high',
              evidence: ['XHR GET /api/hidden'],
              foundIn: ['browser network'],
            },
          ],
        },
      },
    });

    expect(report.buriedApis).toHaveLength(1);
    expect(report.buriedApis[0]).toEqual(
      expect.objectContaining({
        method: 'GET',
        path: '/api/hidden',
        source: 'sourcemap,dynamic',
        sources: ['sourcemap', 'dynamic'],
        confidence: 'high',
        evidence: ['fetch("/api/hidden")', 'XHR GET /api/hidden'],
        foundIn: ['app.js.map', 'browser network'],
      }),
    );
  });

  test('calculates risk score from documented versus total endpoint count', () => {
    const report = generateReport('https://example.test', {
      phases: {
        metadata: {
          metadata: { discoveredDocs: { '/openapi.json': { paths: { '/api/public': { get: {} } } } } },
        },
        chunks: { apis: [{ url: 'https://example.test/api/private', method: 'POST' }] },
      },
    });

    expect(report.surfaceApis).toHaveLength(1);
    expect(report.buriedApis).toHaveLength(1);
    expect(report.riskScore).toBe(50);
  });

  test('does not deduplicate same path and method across different origins', () => {
    const report = generateReport('https://example.test', {
      phases: {
        chunks: {
          apis: [
            { url: 'https://api-one.example.test/api/users', method: 'GET', source: 'chunks' },
            { url: 'https://api-two.example.test/api/users', method: 'GET', source: 'chunks' },
          ],
        },
      },
    });

    expect(report.buriedApis).toHaveLength(2);
    expect(report.buriedApis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: 'https://api-one.example.test/api/users', path: '/api/users' }),
        expect.objectContaining({ url: 'https://api-two.example.test/api/users', path: '/api/users' }),
      ]),
    );
  });

  test('returns zero risk when no endpoints are discovered', () => {
    const report = generateReport('https://example.test', { phases: {} });

    expect(report.surfaceApis).toEqual([]);
    expect(report.buriedApis).toEqual([]);
    expect(report.riskScore).toBe(0);
  });
});
