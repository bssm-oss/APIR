import puppeteer from 'puppeteer';

const API_URL_PATTERNS = [
  /\/api(?:\/|$|\?)/i,
  /\/graphql(?:\/|$|\?)/i,
  /\/rest(?:\/|$|\?)/i,
  /\/rpc(?:\/|$|\?)/i,
  /\/v\d+(?:\/|$|\?)/i,
  /(?:api|graphql|endpoint|rpc|ajax|json)/i,
];

const STATIC_ASSET_PATTERN = /\.(?:css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|pdf|zip|map)(?:$|[?#])/i;
const INTERACTIVE_SELECTOR = [
  'button',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[aria-haspopup]',
  '[aria-expanded]',
  '[data-toggle]',
  '[data-bs-toggle]',
  '[data-testid*="tab" i]',
  '[data-testid*="modal" i]',
  '[class*="dropdown" i]',
  '[class*="tab" i]',
  '[class*="modal" i]',
].join(',');

const SEARCH_SELECTOR = [
  'input[type="search"]',
  'input[name*="search" i]',
  'input[id*="search" i]',
  'input[placeholder*="search" i]',
  'input[name*="query" i]',
  'input[id*="query" i]',
  'input[placeholder*="query" i]',
].join(',');

const FORM_FIELD_SELECTOR = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select';
const SQL_INJECTION_PAYLOAD = "' OR '1'='1";
const MAX_CLICK_TARGETS = 25;
const MAX_FORM_TARGETS = 8;
const MAX_SEARCH_TARGETS = 8;
const RESPONSE_BODY_LIMIT = 8000;
const PUPPETEER_HEADLESS = (process.env.PUPPETEER_HEADLESS ?? 'true') !== 'false' ? 'new' : false;

export async function dynamicTriggerExposure(targetUrl) {
  const apis = [];
  const errors = [];
  const capturedRequests = [];
  const requestRecords = new Map();
  const seenApis = new Set();
  const metadata = {
    targetUrl,
    actionsAttempted: [],
    networkRequestsCaptured: 0,
    apiRequestsCaptured: 0,
  };

  try {
    new URL(targetUrl);
  } catch (error) {
    return {
      apis,
      errors: [`Invalid target URL: ${formatError(error)}`],
      metadata,
    };
  }

  let browser;
  let currentAction = 'initial-load';

  try {
    browser = await puppeteer.launch({
      headless: PUPPETEER_HEADLESS,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(30000);

    await page.setRequestInterception(true);
    page.on('request', (request) => {
      metadata.networkRequestsCaptured += 1;

      if (isApiLikeRequest(request)) {
        const record = createRequestRecord(request, currentAction);
        requestRecords.set(request, record);
        capturedRequests.push(record);
      }

      request.continue().catch((error) => {
        errors.push(`Failed to continue request ${request.url()}: ${formatError(error)}`);
      });
    });

    page.on('response', async (response) => {
      const request = response.request();
      const record = requestRecords.get(request);

      if (!record) {
        return;
      }

      record.status = response.status();
      record.contentType = response.headers()['content-type'] ?? '';

      if (shouldCaptureResponseBody(record, response)) {
        try {
          const body = await response.text();
          record.errorResponseBody = body.slice(0, RESPONSE_BODY_LIMIT);
        } catch (error) {
          errors.push(`Failed to read response body for ${record.url}: ${formatError(error)}`);
        }
      }
    });

    await safeAction('navigate to target URL', errors, metadata, async () => {
      await page.goto(targetUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
    });

    await safeAction('scroll to bottom', errors, metadata, async () => {
      currentAction = 'scroll-to-bottom';
      await scrollToBottom(page);
      await waitForNetworkSettling(page);
    });

    await safeAction('click dropdowns tabs and modals', errors, metadata, async () => {
      currentAction = 'interactive-click';
      await clickInteractiveElements(page, errors);
    });

    await safeAction('fill login and registration forms', errors, metadata, async () => {
      currentAction = 'form-fill';
      await fillAndSubmitForms(page, errors);
    });

    await safeAction('inject SQL payload into search fields', errors, metadata, async () => {
      currentAction = 'sql-injection-search';
      await injectSearchPayloads(page, errors);
    });

    await waitForNetworkSettling(page);
  } catch (error) {
    errors.push(`Dynamic trigger exposure failed: ${formatError(error)}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  for (const record of capturedRequests) {
    if (!isApiLikeRecord(record)) {
      continue;
    }

    const api = createApiRecord(record);
    const dedupeKey = `${api.method}|${api.url}|${api.evidence.action}`;
    if (seenApis.has(dedupeKey)) {
      continue;
    }

    seenApis.add(dedupeKey);
    apis.push(api);
  }

  metadata.apiRequestsCaptured = apis.length;

  return { apis, errors, metadata };
}

async function safeAction(actionName, errors, metadata, action) {
  metadata.actionsAttempted.push(actionName);

  try {
    await action();
  } catch (error) {
    errors.push(`${actionName} failed: ${formatError(error)}`);
  }
}

async function scrollToBottom(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const timer = setInterval(() => {
        const scrollHeight = globalThis.document.body?.scrollHeight ?? globalThis.document.documentElement.scrollHeight;
        globalThis.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight || totalHeight > 12000) {
          clearInterval(timer);
          resolve();
        }
      }, 150);
    });
  });
}

async function clickInteractiveElements(page, errors) {
  const targets = await page.$$(INTERACTIVE_SELECTOR);

  for (const target of targets.slice(0, MAX_CLICK_TARGETS)) {
    try {
      const clickable = await target.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = globalThis.getComputedStyle(element);

        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      });

      if (!clickable) {
        continue;
      }

      await target.click({ delay: 25 });
      await waitForNetworkSettling(page);
    } catch (error) {
      errors.push(`interactive element click skipped: ${formatError(error)}`);
    }
  }
}

async function fillAndSubmitForms(page, errors) {
  const forms = await page.$$('form');
  const targets = forms.length > 0 ? forms.slice(0, MAX_FORM_TARGETS) : (await page.$$(FORM_FIELD_SELECTOR)).slice(0, MAX_FORM_TARGETS);

  for (const target of targets) {
    try {
      const fields = await getFieldsForTarget(target);
      await fillFields(fields);
      await submitTarget(target, page);
      await waitForNetworkSettling(page);
    } catch (error) {
      errors.push(`form automation skipped: ${formatError(error)}`);
    }
  }
}

async function injectSearchPayloads(page, errors) {
  const searchFields = await page.$$(SEARCH_SELECTOR);

  for (const field of searchFields.slice(0, MAX_SEARCH_TARGETS)) {
    try {
      const visible = await field.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = globalThis.getComputedStyle(element);

        return rect.width > 0 && rect.height > 0 && !element.disabled && style.visibility !== 'hidden' && style.display !== 'none';
      });

      if (!visible) {
        continue;
      }

      await field.click({ clickCount: 3 });
      await field.type(SQL_INJECTION_PAYLOAD, { delay: 10 });
      await field.press('Enter');
      await waitForNetworkSettling(page);
    } catch (error) {
      errors.push(`SQL injection search automation skipped: ${formatError(error)}`);
    }
  }
}

async function getFieldsForTarget(target) {
  const tagName = await target.evaluate((element) => element.tagName.toLowerCase());

  if (tagName === 'form') {
    return target.$$(FORM_FIELD_SELECTOR);
  }

  return [target];
}

async function fillFields(fields) {
  for (const field of fields) {
    const fieldInfo = await field.evaluate((element) => ({
      disabled: element.disabled,
      name: element.getAttribute('name') ?? '',
      placeholder: element.getAttribute('placeholder') ?? '',
      tagName: element.tagName.toLowerCase(),
      type: element.getAttribute('type') ?? 'text',
      visible: element.offsetWidth > 0 && element.offsetHeight > 0,
    }));

    if (fieldInfo.disabled || !fieldInfo.visible) {
      continue;
    }

    if (fieldInfo.tagName === 'select') {
      const value = await field.evaluate((element) => {
        const option = [...element.options].find((item) => !item.disabled && item.value);
        return option?.value ?? '';
      });

      if (value) {
        await field.select(value);
      }
      continue;
    }

    const fakeValue = getFakeValue(fieldInfo);
    await field.click({ clickCount: 3 });
    await field.type(fakeValue, { delay: 10 });
  }
}

async function submitTarget(target, page) {
  const submitButton = await target.$?.('button[type="submit"], input[type="submit"], button:not([type])');

  if (submitButton) {
    await submitButton.click({ delay: 25 });
    return;
  }

  const tagName = await target.evaluate((element) => element.tagName.toLowerCase());
  if (tagName === 'form') {
    await target.evaluate((form) => {
      form.requestSubmit?.();
      if (!form.requestSubmit) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    });
    return;
  }

  await page.keyboard.press('Enter');
}

function getFakeValue(fieldInfo) {
  const descriptor = `${fieldInfo.name} ${fieldInfo.placeholder} ${fieldInfo.type}`.toLowerCase();

  if (descriptor.includes('email')) {
    return 'apir-test@example.com';
  }

  if (descriptor.includes('password')) {
    return 'ApirTest123!';
  }

  if (descriptor.includes('phone') || descriptor.includes('tel')) {
    return '01012345678';
  }

  if (descriptor.includes('name') || descriptor.includes('user')) {
    return 'apir-test-user';
  }

  if (descriptor.includes('search') || descriptor.includes('query')) {
    return 'apir dynamic test';
  }

  return 'apir-test-value';
}

async function waitForNetworkSettling(page) {
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 3000 }).catch(() => {});
}

function createRequestRecord(request, action) {
  return {
    action,
    method: request.method(),
    postData: request.postData() ?? null,
    resourceType: request.resourceType(),
    status: null,
    url: request.url(),
  };
}

function createApiRecord(record) {
  const metadata = {
    resourceType: record.resourceType,
    status: record.status,
  };

  if (record.contentType) {
    metadata.contentType = record.contentType;
  }

  if (record.errorResponseBody) {
    metadata.errorResponseBody = record.errorResponseBody;
  }

  return {
    url: record.url,
    source: 'dynamic',
    confidence: record.action === 'initial-load' ? 'medium' : 'high',
    method: record.method,
    evidence: {
      action: record.action,
      postData: record.postData,
    },
    metadata,
  };
}

function isApiLikeRequest(request) {
  if (['xhr', 'fetch'].includes(request.resourceType())) {
    return true;
  }

  return isApiLikeUrl(request.url());
}

function isApiLikeRecord(record) {
  if (STATIC_ASSET_PATTERN.test(record.url)) {
    return false;
  }

  if (['xhr', 'fetch'].includes(record.resourceType)) {
    return true;
  }

  if (record.contentType && /(?:application|text)\/(?:json|xml)|graphql/i.test(record.contentType)) {
    return true;
  }

  return isApiLikeUrl(record.url);
}

function isApiLikeUrl(value) {
  if (!value || STATIC_ASSET_PATTERN.test(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    return API_URL_PATTERNS.some((pattern) => pattern.test(`${url.pathname}${url.search}`));
  } catch {
    return API_URL_PATTERNS.some((pattern) => pattern.test(value));
  }
}

function shouldCaptureResponseBody(record, response) {
  if (record.action !== 'sql-injection-search') {
    return false;
  }

  if (response.status() >= 400) {
    return true;
  }

  const contentType = response.headers()['content-type'] ?? '';
  return /(?:json|text|html|xml)/i.test(contentType);
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export default dynamicTriggerExposure;
