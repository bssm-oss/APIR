import { jest } from '@jest/globals';

function createPageMock() {
  return {
    goto: jest.fn().mockResolvedValue(undefined),
    setRequestInterception: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    evaluate: jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce([]),
  };
}

async function loadServiceWorkerWithPuppeteerMock() {
  jest.resetModules();

  const page = createPageMock();
  const browser = {
    newPage: jest.fn().mockResolvedValue(page),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const puppeteer = {
    launch: jest.fn().mockResolvedValue(browser),
  };

  jest.unstable_mockModule('puppeteer', () => ({ default: puppeteer }));
  const module = await import('../server/phases/serviceworker.js');

  return { ...module, puppeteer, browser, page };
}

describe('analyzeServiceWorker', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('imports successfully and exports analyzeServiceWorker', async () => {
    const { analyzeServiceWorker } = await loadServiceWorkerWithPuppeteerMock();

    expect(analyzeServiceWorker).toEqual(expect.any(Function));
  });

  test('returns phase-shaped errors for invalid URLs without launching Puppeteer', async () => {
    const { analyzeServiceWorker, puppeteer } = await loadServiceWorkerWithPuppeteerMock();

    const result = await analyzeServiceWorker('not a url');

    expect(puppeteer.launch).not.toHaveBeenCalled();
    expect(result).toEqual({
      apis: [],
      errors: [expect.objectContaining({ code: 'INVALID_URL', message: expect.stringContaining('Invalid target URL'), phase: 'serviceworker' })],
      metadata: {
        serviceWorkerRegistered: false,
        cachesFound: 0,
        cachedRequestsAnalyzed: 0,
      },
    });
  });

  test('function signature matches the expected targetUrl parameter', async () => {
    const { analyzeServiceWorker } = await loadServiceWorkerWithPuppeteerMock();

    expect(analyzeServiceWorker).toHaveLength(1);
  });

  test('uses mocked Puppeteer for valid URL execution', async () => {
    const { analyzeServiceWorker, puppeteer, browser, page } = await loadServiceWorkerWithPuppeteerMock();

    const result = await analyzeServiceWorker('https://example.test/');

    expect(puppeteer.launch).toHaveBeenCalledWith({ headless: 'new' });
    expect(browser.newPage).toHaveBeenCalled();
    expect(page.goto).toHaveBeenCalledWith('https://example.test/', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    expect(browser.close).toHaveBeenCalled();
    expect(result).toEqual({
      apis: [],
      errors: [],
      metadata: {
        serviceWorkerRegistered: false,
        cachesFound: 0,
        cachedRequestsAnalyzed: 0,
      },
    });
  });
});
