import puppeteer from 'puppeteer';

const API_URL_PATTERNS = [
  /\/api(?:\/|$|\?)/i,
  /\/graphql(?:\/|$|\?)/i,
  /\/rest(?:\/|$|\?)/i,
  /\/v\d+(?:\/|$|\?)/i,
  /(?:api|graphql|endpoint|rpc)/i,
];

const PUPPETEER_HEADLESS = (process.env.PUPPETEER_HEADLESS ?? 'true') !== 'false' ? 'new' : false;

export async function analyzeServiceWorker(targetUrl) {
  const apis = [];
  const errors = [];
  const metadata = {
    serviceWorkerRegistered: false,
    cachesFound: 0,
    cachedRequestsAnalyzed: 0,
  };

  try {
    new URL(targetUrl);
  } catch (error) {
    return {
      apis,
      errors: [`Invalid target URL: ${error.message}`],
      metadata,
    };
  }

  let browser;
  try {
    browser = await puppeteer.launch({ headless: PUPPETEER_HEADLESS });
    const page = await browser.newPage();

    await page.goto(targetUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    metadata.serviceWorkerRegistered = await hasServiceWorkerRegistration(page);

    const cacheNames = await page.evaluate(async () => {
      if (!('caches' in globalThis)) {
        return [];
      }

      return globalThis.caches.keys();
    });

    metadata.cachesFound = cacheNames.length;

    const seenUrls = new Set();
    for (const cacheName of cacheNames) {
      let requestUrls;
      try {
        requestUrls = await page.evaluate(async (name) => {
          const cache = await globalThis.caches.open(name);
          const requests = await cache.keys();
          return requests.map((request) => request.url);
        }, cacheName);
      } catch (error) {
        errors.push(`Failed to read cache ${cacheName}: ${error.message}`);
        continue;
      }

      metadata.cachedRequestsAnalyzed += requestUrls.length;

      for (const requestUrl of requestUrls) {
        if (!isApiLikeUrl(requestUrl) || seenUrls.has(requestUrl)) {
          continue;
        }

        seenUrls.add(requestUrl);
        apis.push({
          url: requestUrl,
          source: 'serviceworker',
          confidence: 'high',
          evidence: {
            cacheName,
          },
        });
      }
    }
  } catch (error) {
    errors.push(`Service worker analysis failed: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return { apis, errors, metadata };
}

async function hasServiceWorkerRegistration(page) {
  try {
    return page.evaluate(async () => {
      if (!('serviceWorker' in globalThis.navigator)) {
        return false;
      }

      const registration = await globalThis.navigator.serviceWorker.getRegistration();
      return Boolean(registration);
    });
  } catch {
    return false;
  }
}

function isApiLikeUrl(value) {
  try {
    const url = new URL(value);
    return API_URL_PATTERNS.some((pattern) => pattern.test(`${url.pathname}${url.search}`));
  } catch {
    return API_URL_PATTERNS.some((pattern) => pattern.test(value));
  }
}
