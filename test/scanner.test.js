import { jest } from '@jest/globals';

const phaseNames = ['sourcemap', 'window', 'chunks', 'metadata', 'dynamic', 'graphql', 'serviceworker', 'phantom'];

async function loadScannerWithMocks(overrides = {}) {
  jest.resetModules();

  const mocks = Object.fromEntries(
    phaseNames.map((phaseName) => [
      phaseName,
      jest.fn().mockResolvedValue({
        apis: [{ path: `/api/${phaseName}`, method: 'GET', source: phaseName }],
        errors: [],
        metadata: { mocked: true },
      }),
    ]),
  );

  Object.assign(mocks, overrides);

  jest.unstable_mockModule('../server/phases/sourcemap.js', () => ({ extractSourceMaps: mocks.sourcemap }));
  jest.unstable_mockModule('../server/phases/window.js', () => ({ harvestWindowObject: mocks.window }));
  jest.unstable_mockModule('../server/phases/chunks.js', () => ({ analyzeChunks: mocks.chunks }));
  jest.unstable_mockModule('../server/phases/metadata.js', () => ({ extractMetadata: mocks.metadata }));
  jest.unstable_mockModule('../server/phases/dynamic.js', () => ({ dynamicTriggerExposure: mocks.dynamic }));
  jest.unstable_mockModule('../server/phases/graphql.js', () => ({ analyzeGraphQL: mocks.graphql }));
  jest.unstable_mockModule('../server/phases/serviceworker.js', () => ({ analyzeServiceWorker: mocks.serviceworker }));
  jest.unstable_mockModule('../server/phases/phantom.js', () => ({ phantomFlow: mocks.phantom }));
  jest.unstable_mockModule('../lib/cors-checker.js', () => ({
    checkCORS: jest.fn().mockResolvedValue({ vulnerable: [] }),
  }));
  jest.unstable_mockModule('../lib/jwt-analyzer.js', () => ({ analyzeJWT: jest.fn().mockReturnValue({ tokens: [] }) }));
  jest.unstable_mockModule('../lib/fingerprint.js', () => ({
    fingerprint: jest.fn().mockReturnValue({ server: 'nginx', framework: '', via: '', estimatedStack: 'nginx' }),
  }));

  const { Scanner } = await import('../server/scanner.js');
  return { Scanner, mocks };
}

function createHttpClient() {
  return {
    get: jest.fn().mockResolvedValue({ headers: { server: 'nginx/1.25' }, data: '<html></html>' }),
    request: jest.fn().mockResolvedValue({ headers: {} }),
  };
}

describe('Scanner', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('imports and executes phases in orchestrator order', async () => {
    const callOrder = [];
    const overrides = Object.fromEntries(
      phaseNames.map((phaseName) => [
        phaseName,
        jest.fn().mockImplementation(async () => {
          callOrder.push(phaseName);
          return { apis: [{ path: `/api/${phaseName}`, method: 'GET' }], errors: [], metadata: {} };
        }),
      ]),
    );
    const { Scanner } = await loadScannerWithMocks(overrides);

    const report = await new Scanner({ httpClient: createHttpClient() }).scan('https://example.test/', { active: true });

    expect(callOrder).toEqual(phaseNames);
    expect(report.metadata.phaseTimings).toEqual(expect.objectContaining(Object.fromEntries(phaseNames.map((name) => [name, expect.any(Number)]))));
    expect(report.buriedApis).toEqual(expect.arrayContaining([expect.objectContaining({ path: '/api/sourcemap' })]));
  });

  test('respects skip options and does not invoke skipped phases', async () => {
    const { Scanner, mocks } = await loadScannerWithMocks();

    const report = await new Scanner({ httpClient: createHttpClient() }).scan('https://example.test/', {
      active: true,
      skip: 'dynamic,phantom',
    });

    expect(mocks.dynamic).not.toHaveBeenCalled();
    expect(mocks.phantom).not.toHaveBeenCalled();
    expect(report.metadata.skippedPhases).toEqual(['dynamic', 'phantom']);
    expect(report.metadata.phaseTimings.dynamic).toBe(0);
  });

  test('rejects unknown skip phases before phase execution', async () => {
    const { Scanner, mocks } = await loadScannerWithMocks();

    await expect(new Scanner({ httpClient: createHttpClient() }).scan('https://example.test/', { skip: 'dynamic,unknown' })).rejects.toThrow(
      'Invalid skip phase: unknown',
    );
    expect(mocks.sourcemap).not.toHaveBeenCalled();
  });

  test('skips active browser phases by default', async () => {
    const { Scanner, mocks } = await loadScannerWithMocks();

    const report = await new Scanner({ httpClient: createHttpClient() }).scan('https://example.test/');

    expect(mocks.dynamic).not.toHaveBeenCalled();
    expect(mocks.serviceworker).not.toHaveBeenCalled();
    expect(mocks.phantom).not.toHaveBeenCalled();
    expect(report.metadata.active).toBe(false);
    expect(report.metadata.skippedPhases).toEqual(expect.arrayContaining(['dynamic', 'serviceworker', 'phantom']));
  });

  test('quick scans only run sourcemap, window, and metadata phases', async () => {
    const { Scanner, mocks } = await loadScannerWithMocks();

    const report = await new Scanner({ httpClient: createHttpClient() }).scan('https://example.test/', {
      quick: true,
    });

    expect(mocks.sourcemap).toHaveBeenCalled();
    expect(mocks.window).toHaveBeenCalled();
    expect(mocks.metadata).toHaveBeenCalled();
    expect(mocks.chunks).not.toHaveBeenCalled();
    expect(mocks.dynamic).not.toHaveBeenCalled();
    expect(mocks.graphql).not.toHaveBeenCalled();
    expect(mocks.serviceworker).not.toHaveBeenCalled();
    expect(mocks.phantom).not.toHaveBeenCalled();
    expect(report.metadata.skippedPhases).toEqual(expect.arrayContaining(['chunks', 'dynamic', 'graphql', 'serviceworker', 'phantom']));
    expect(report.metadata.phaseTimings.chunks).toBe(0);
  });

  test('runs independent phases before graphql in concurrent mode', async () => {
    let resolveSourcemap;
    const sourcemapOutput = { apis: [{ path: '/api/sourcemap', method: 'GET' }], errors: [], metadata: {} };
    const sourcemap = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveSourcemap = () => resolve(sourcemapOutput);
        }),
    );
    const { Scanner, mocks } = await loadScannerWithMocks({ sourcemap });

    const scanPromise = new Scanner({ httpClient: createHttpClient() }).scan('https://example.test/', { concurrency: 4, active: true });
    await Promise.resolve();

    expect(mocks.window).toHaveBeenCalled();
    expect(mocks.chunks).toHaveBeenCalled();
    expect(mocks.metadata).toHaveBeenCalled();
    expect(mocks.dynamic).toHaveBeenCalled();
    expect(mocks.serviceworker).toHaveBeenCalled();
    expect(mocks.phantom).toHaveBeenCalled();
    expect(mocks.graphql).not.toHaveBeenCalled();

    resolveSourcemap();
    const report = await scanPromise;

    expect(mocks.graphql).toHaveBeenCalledWith(
      'https://example.test/',
      expect.any(Object),
      expect.objectContaining({ apis: sourcemapOutput.apis }),
      expect.any(Array),
    );
    expect(report.metadata.concurrency).toBe(3);
  });

  test('normalizes phase failures into report metadata instead of throwing', async () => {
    const { Scanner, mocks } = await loadScannerWithMocks({
      chunks: jest.fn().mockRejectedValue(new Error('parser exploded')),
    });

    const report = await new Scanner({ httpClient: createHttpClient() }).scan('https://example.test/');

    expect(mocks.chunks).toHaveBeenCalled();
    expect(report.metadata.phaseTimings.chunks).toEqual(expect.any(Number));
    expect(report.metadata.phaseErrors.chunks).toEqual([
      expect.objectContaining({ code: 'PHASE_FAILED', message: expect.stringContaining('chunks phase failed: parser exploded'), phase: 'chunks' }),
    ]);
    expect(report.buriedApis).not.toEqual(expect.arrayContaining([expect.objectContaining({ path: '/api/chunks' })]));
  });

  test('passes metadata-discovered GraphQL paths to the GraphQL phase', async () => {
    const metadataResult = {
      apis: [],
      errors: [],
      metadata: { discoveredGraphQLPaths: ['/api/graphql', 'https://example.test/custom-graphql'] },
    };
    const { Scanner, mocks } = await loadScannerWithMocks({
      metadata: jest.fn().mockResolvedValue(metadataResult),
    });
    const httpClient = createHttpClient();

    await new Scanner({ httpClient }).scan('https://example.test/');

    expect(mocks.graphql).toHaveBeenCalledWith(
      'https://example.test/',
      httpClient,
      expect.objectContaining({ apis: expect.any(Array), metadata: expect.objectContaining({ phase: 'sourcemap' }) }),
      ['/api/graphql', 'https://example.test/custom-graphql'],
    );
  });

  test('rejects invalid target URLs before phase execution', async () => {
    const { Scanner, mocks } = await loadScannerWithMocks();

    await expect(new Scanner({ httpClient: createHttpClient() }).scan('not a url')).rejects.toThrow('Invalid URL');
    expect(mocks.sourcemap).not.toHaveBeenCalled();
  });

  test.each(['ftp://example.test/', 'file:///etc/passwd', 'http://localhost/', 'http://127.0.0.1/', 'http://10.0.0.1/', 'http://172.16.0.1/', 'http://192.168.0.1/', 'http://169.254.169.254/'])(
    'rejects disallowed target URL %s before phase execution',
    async (targetUrl) => {
      const { Scanner, mocks } = await loadScannerWithMocks();

      await expect(new Scanner({ httpClient: createHttpClient() }).scan(targetUrl)).rejects.toThrow(/Disallowed|Invalid/i);
      expect(mocks.sourcemap).not.toHaveBeenCalled();
    },
  );
});
