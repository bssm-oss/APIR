import { jest } from '@jest/globals';

function createPageMock() {
  return {
    goto: jest.fn().mockResolvedValue(undefined),
    setRequestInterception: jest.fn().mockResolvedValue(undefined),
    $$: jest.fn().mockResolvedValue([]),
    on: jest.fn(),
    off: jest.fn(),
    evaluateOnNewDocument: jest.fn().mockResolvedValue(undefined),
    evaluate: jest.fn().mockResolvedValueOnce({ detected: [], subscriptions: [], actions: [] }).mockResolvedValueOnce([]),
    mouse: {
      move: jest.fn().mockResolvedValue(undefined),
    },
    keyboard: {
      press: jest.fn().mockResolvedValue(undefined),
    },
  };
}

async function loadPhantomWithPuppeteerMock() {
  jest.resetModules();

  const pages = [createPageMock(), createPageMock(), createPageMock()];
  const browser = {
    newPage: jest.fn().mockImplementation(() => Promise.resolve(pages[browser.newPage.mock.calls.length - 1] ?? createPageMock())),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const puppeteer = {
    launch: jest.fn().mockResolvedValue(browser),
  };

  jest.unstable_mockModule('puppeteer', () => ({ default: puppeteer }));
  const module = await import('../server/phases/phantom.js');

  return { ...module, puppeteer, browser, pages };
}

describe('phantomFlow', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('imports successfully and exports phantomFlow', async () => {
    const { phantomFlow } = await loadPhantomWithPuppeteerMock();

    expect(phantomFlow).toEqual(expect.any(Function));
  });

  test('returns phase-shaped errors for invalid URLs without launching Puppeteer', async () => {
    const { phantomFlow, puppeteer } = await loadPhantomWithPuppeteerMock();

    const result = await phantomFlow('not a url');

    expect(puppeteer.launch).not.toHaveBeenCalled();
    expect(result).toEqual({
      apis: [],
      errors: [
        expect.objectContaining({ code: 'INVALID_URL', message: 'Invalid target URL: not a url', phase: 'phantom', source: 'hypermedia' }),
        expect.objectContaining({ code: 'INVALID_URL', message: 'Invalid target URL: not a url', phase: 'phantom', source: 'state' }),
        expect.objectContaining({ code: 'INVALID_URL', message: 'Invalid target URL: not a url', phase: 'phantom', source: 'redirect' }),
      ],
      metadata: {
        hypermedia: {
          interactiveElementsFound: 0,
          interactionsAttempted: 0,
          requestsCaptured: 0,
        },
        stateTransitions: {
          storesDetected: [],
          actionsObserved: [],
          subscriptionsInstalled: [],
        },
        redirects: {
          redirectCount: 0,
          chains: [],
        },
      },
    });
  });

  test('function signature matches the expected targetUrl parameter', async () => {
    const { phantomFlow } = await loadPhantomWithPuppeteerMock();

    expect(phantomFlow).toHaveLength(1);
  });

  test('uses mocked Puppeteer for valid URL execution', async () => {
    const { phantomFlow, puppeteer, browser, pages } = await loadPhantomWithPuppeteerMock();

    const result = await phantomFlow('https://example.test/');

    expect(puppeteer.launch).toHaveBeenCalledTimes(3);
    expect(puppeteer.launch).toHaveBeenCalledWith({ headless: 'new' });
    expect(browser.newPage).toHaveBeenCalledTimes(3);
    expect(pages[0].goto).toHaveBeenCalledWith('https://example.test/', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    expect(pages[1].evaluateOnNewDocument).toHaveBeenCalled();
    expect(pages[2].on).toHaveBeenCalledWith('response', expect.any(Function));
    expect(browser.close).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      apis: [],
      errors: [],
      metadata: {
        hypermedia: expect.objectContaining({ requestsCaptured: 0 }),
        stateTransitions: expect.objectContaining({ actionsObserved: [] }),
        redirects: expect.objectContaining({ redirectCount: 0 }),
      },
    });
  });
});
