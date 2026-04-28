import { jest } from '@jest/globals';

function createPageMock() {
  return {
    setDefaultTimeout: jest.fn(),
    setDefaultNavigationTimeout: jest.fn(),
    setRequestInterception: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    goto: jest.fn().mockResolvedValue(undefined),
    evaluate: jest.fn().mockResolvedValue(undefined),
    $$: jest.fn().mockResolvedValue([]),
    waitForNetworkIdle: jest.fn().mockResolvedValue(undefined),
  };
}

async function loadDynamicWithPuppeteerMock() {
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
  const module = await import('../server/phases/dynamic.js');

  return { ...module, puppeteer, browser, page };
}

describe('dynamicTriggerExposure', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('imports successfully and exports dynamicTriggerExposure', async () => {
    const { dynamicTriggerExposure } = await loadDynamicWithPuppeteerMock();

    expect(dynamicTriggerExposure).toEqual(expect.any(Function));
  });

  test('returns phase-shaped errors for invalid URLs without launching Puppeteer', async () => {
    const { dynamicTriggerExposure, puppeteer } = await loadDynamicWithPuppeteerMock();

    const result = await dynamicTriggerExposure('not a url');

    expect(puppeteer.launch).not.toHaveBeenCalled();
    expect(result).toEqual({
      apis: [],
      errors: [expect.stringContaining('Invalid target URL')],
      metadata: expect.objectContaining({
        targetUrl: 'not a url',
        actionsAttempted: [],
        networkRequestsCaptured: 0,
        apiRequestsCaptured: 0,
      }),
    });
  });

  test('function signature matches the expected targetUrl parameter', async () => {
    const { dynamicTriggerExposure } = await loadDynamicWithPuppeteerMock();

    expect(dynamicTriggerExposure).toHaveLength(1);
  });

  test('uses mocked Puppeteer for valid URL execution', async () => {
    const { dynamicTriggerExposure, puppeteer, browser, page } = await loadDynamicWithPuppeteerMock();

    const result = await dynamicTriggerExposure('https://example.test/');

    expect(puppeteer.launch).toHaveBeenCalledWith({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    expect(browser.newPage).toHaveBeenCalled();
    expect(page.goto).toHaveBeenCalledWith('https://example.test/', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    expect(browser.close).toHaveBeenCalled();
    expect(result).toEqual({
      apis: [],
      errors: [],
      metadata: expect.objectContaining({
        targetUrl: 'https://example.test/',
        apiRequestsCaptured: 0,
      }),
    });
  });
});
