import puppeteer from 'puppeteer';

const PAGE_TIMEOUT_MS = 30000;
const INTERACTION_TIMEOUT_MS = 5000;
const STATE_OBSERVATION_MS = 2500;
const REDIRECT_STATUSES = new Set([301, 302]);
const PUPPETEER_HEADLESS = (process.env.PUPPETEER_HEADLESS ?? 'true') !== 'false' ? 'new' : false;

export async function hypermediaMapping(targetUrl) {
  const apis = [];
  const errors = [];
  const metadata = {
    interactiveElementsFound: 0,
    interactionsAttempted: 0,
    requestsCaptured: 0,
  };

  if (!isValidUrl(targetUrl)) {
    return {
      apis,
      errors: [`Invalid target URL: ${targetUrl}`],
      metadata,
    };
  }

  let browser;
  try {
    browser = await puppeteer.launch({ headless: PUPPETEER_HEADLESS });
    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: PAGE_TIMEOUT_MS });

    const elements = await page.$$('a, form, button');
    metadata.interactiveElementsFound = elements.length;
    const descriptors = [];

    for (let index = 0; index < elements.length; index += 1) {
      const descriptor = await extractInteractiveElement(elements[index], index);
      descriptors.push(descriptor);
      await elements[index].dispose();
    }

    for (const descriptor of descriptors) {
      const requests = [];
      const requestListener = (request) => {
        requests.push(createRequestSnapshot(request));
      };

      try {
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: PAGE_TIMEOUT_MS });
        const currentElements = await page.$$('a, form, button');
        const element = currentElements[descriptor.index];

        if (!element) {
          errors.push(`Interactive element ${descriptor.index} disappeared before interaction`);
          await disposeElements(currentElements);
          continue;
        }

        const interactable = await isElementInteractable(element);
        if (!interactable) {
          await disposeElements(currentElements);
          continue;
        }

        page.on('request', requestListener);
        metadata.interactionsAttempted += 1;
        await triggerInteraction(page, element, descriptor);
        await waitForInteraction(page);
        page.off('request', requestListener);

        for (const request of requests) {
          apis.push({
            url: request.url,
            method: request.method,
            headers: request.headers,
            source: 'phantom-hypermedia',
            confidence: 'medium',
            evidence: {
              element: descriptor,
              request,
            },
          });
        }

        metadata.requestsCaptured += requests.length;
        await disposeElements(currentElements);
      } catch (error) {
        page.off('request', requestListener);
        errors.push(`Hypermedia interaction ${descriptor.index} failed: ${formatError(error)}`);
      }
    }
  } catch (error) {
    errors.push(`Hypermedia mapping failed: ${formatError(error)}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return { apis: dedupeApis(apis), errors, metadata };
}

export async function stateTransitionTracking(targetUrl) {
  const apis = [];
  const errors = [];
  const metadata = {
    storesDetected: [],
    actionsObserved: [],
    subscriptionsInstalled: [],
  };

  if (!isValidUrl(targetUrl)) {
    return {
      apis,
      errors: [`Invalid target URL: ${targetUrl}`],
      metadata,
    };
  }

  let browser;
  try {
    browser = await puppeteer.launch({ headless: PUPPETEER_HEADLESS });
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      globalThis.__APIR_PHANTOM_ACTIONS__ = [];

      const recordAction = (source, action) => {
        const type = typeof action === 'string' ? action : action?.type ?? action?.name ?? null;
        if (type) {
          globalThis.__APIR_PHANTOM_ACTIONS__.push({ source, type, at: Date.now() });
        }
      };

      const hookStore = (store, source) => {
        if (!store || typeof store !== 'object' || store.__apirPhantomHooked) {
          return false;
        }

        const originalDispatch = typeof store.dispatch === 'function' ? store.dispatch : null;
        if (originalDispatch) {
          store.dispatch = function dispatchWithApirCapture(action, ...args) {
            recordAction(source, action);
            return originalDispatch.call(this, action, ...args);
          };
        }

        try {
          Object.defineProperty(store, '__apirPhantomHooked', { value: true, configurable: true });
        } catch {
          store.__apirPhantomHooked = true;
        }

        return Boolean(originalDispatch);
      };

      const originalDefineProperty = Object.defineProperty;
      Object.defineProperty = function definePropertyWithStoreCapture(target, property, descriptor) {
        if (target === globalThis && ['__store__', 'store', '$store'].includes(String(property))) {
          const nextDescriptor = { ...descriptor };
          if ('value' in nextDescriptor) {
            hookStore(nextDescriptor.value, String(property));
          }
          return originalDefineProperty.call(this, target, property, nextDescriptor);
        }

        return originalDefineProperty.call(this, target, property, descriptor);
      };

      globalThis.__APIR_PHANTOM_HOOK_STORE__ = hookStore;
    });

    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: PAGE_TIMEOUT_MS });

    const stateSnapshot = await page.evaluate(() => {
      const storeNames = ['__store__', 'store', '$store', '__REDUX_STORE__', '__PINIA__', 'pinia', '__ZUSTAND_STORE__'];
      const detected = [];
      const subscriptions = [];

      for (const name of storeNames) {
        const store = globalThis[name];
        if (!store) {
          continue;
        }

        detected.push(name);
        if (typeof globalThis.__APIR_PHANTOM_HOOK_STORE__ === 'function' && globalThis.__APIR_PHANTOM_HOOK_STORE__(store, name)) {
          subscriptions.push(name);
        }

        if (typeof store.subscribe === 'function') {
          try {
            store.subscribe((...subscriptionArgs) => {
              const action = subscriptionArgs[2];
              const type = action?.type ?? action?.name ?? null;
              if (type) {
                globalThis.__APIR_PHANTOM_ACTIONS__.push({ source: `${name}.subscribe`, type, at: Date.now() });
              }
            });
            subscriptions.push(`${name}.subscribe`);
          } catch {
            // Some stores require selector arguments; dispatch wrapping still captures common cases.
          }
        }
      }

      if (globalThis.__REDUX_DEVTOOLS_EXTENSION__) {
        detected.push('__REDUX_DEVTOOLS_EXTENSION__');
      }

      if (globalThis.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__) {
        detected.push('__REDUX_DEVTOOLS_EXTENSION_COMPOSE__');
      }

      return { detected, subscriptions, actions: globalThis.__APIR_PHANTOM_ACTIONS__ ?? [] };
    });

    metadata.storesDetected = stateSnapshot.detected;
    metadata.subscriptionsInstalled = stateSnapshot.subscriptions;

    await page.mouse.move(1, 1);
    await page.keyboard.press('Tab').catch(() => {});
    await wait(STATE_OBSERVATION_MS);

    const actions = await page.evaluate(() => globalThis.__APIR_PHANTOM_ACTIONS__ ?? []);
    metadata.actionsObserved = actions;

    for (const action of actions) {
      apis.push({
        endpoint: inferEndpointFromAction(action.type),
        action: action.type,
        source: 'phantom-state',
        confidence: 'low',
        evidence: action,
      });
    }
  } catch (error) {
    errors.push(`State transition tracking failed: ${formatError(error)}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return { apis: dedupeApis(apis), errors, metadata };
}

export async function redirectChainReconstruction(targetUrl) {
  const apis = [];
  const errors = [];
  const metadata = {
    redirectCount: 0,
    chains: [],
  };

  if (!isValidUrl(targetUrl)) {
    return {
      apis,
      errors: [`Invalid target URL: ${targetUrl}`],
      metadata,
    };
  }

  let browser;
  try {
    browser = await puppeteer.launch({ headless: PUPPETEER_HEADLESS });
    const page = await browser.newPage();
    const redirects = [];

    page.on('response', (response) => {
      const status = response.status();
      if (!REDIRECT_STATUSES.has(status)) {
        return;
      }

      const request = response.request();
      const headers = response.headers();
      redirects.push({
        request: createRequestSnapshot(request),
        response: {
          url: response.url(),
          status,
          headers,
          location: headers.location ?? null,
        },
      });
    });

    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: PAGE_TIMEOUT_MS });

    const chain = redirects.map((redirect) => ({
      from: redirect.response.url,
      to: resolveRedirectLocation(redirect.response.url, redirect.response.location),
      status: redirect.response.status,
    }));

    metadata.redirectCount = redirects.length;
    metadata.chains = chain;

    for (const redirect of redirects) {
      apis.push({
        url: redirect.response.location ?? redirect.response.url,
        method: redirect.request.method,
        headers: redirect.request.headers,
        source: 'phantom-redirect',
        confidence: 'high',
        evidence: redirect,
      });
    }
  } catch (error) {
    errors.push(`Redirect chain reconstruction failed: ${formatError(error)}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return { apis: dedupeApis(apis), errors, metadata };
}

export async function phantomFlow(targetUrl) {
  const [hypermedia, stateTransitions, redirects] = await Promise.all([
    hypermediaMapping(targetUrl),
    stateTransitionTracking(targetUrl),
    redirectChainReconstruction(targetUrl),
  ]);

  return {
    apis: dedupeApis([...hypermedia.apis, ...stateTransitions.apis, ...redirects.apis]),
    errors: [...hypermedia.errors, ...stateTransitions.errors, ...redirects.errors],
    metadata: {
      hypermedia: hypermedia.metadata,
      stateTransitions: stateTransitions.metadata,
      redirects: redirects.metadata,
    },
  };
}

export default phantomFlow;

async function extractInteractiveElement(element, index) {
  return element.evaluate((node, elementIndex) => {
    const attributes = Object.fromEntries([...node.attributes].map((attribute) => [attribute.name, attribute.value]));
    const tagName = node.tagName.toLowerCase();
    const buttonListeners = [];

    if (tagName === 'button') {
      for (const attribute of node.attributes) {
        if (attribute.name.startsWith('on')) {
          buttonListeners.push(attribute.name.slice(2));
        }
      }

      for (const propertyName of Object.keys(node)) {
        if (propertyName.startsWith('on') && typeof node[propertyName] === 'function') {
          buttonListeners.push(propertyName.slice(2));
        }
      }
    }

    return {
      index: elementIndex,
      tagName,
      text: node.textContent?.trim().slice(0, 120) ?? '',
      href: tagName === 'a' ? node.href : null,
      action: tagName === 'form' ? node.action : null,
      method: tagName === 'form' ? node.method?.toUpperCase() : null,
      buttonListeners: [...new Set(buttonListeners)],
      attributes,
    };
  }, index);
}

async function isElementInteractable(element) {
  const box = await element.boundingBox();
  if (!box || box.width === 0 || box.height === 0) {
    return false;
  }

  return element.evaluate((node) => {
    const style = globalThis.getComputedStyle(node);
    const disabled = node.matches('button:disabled, input:disabled, select:disabled, textarea:disabled');
    return style.visibility !== 'hidden' && style.display !== 'none' && style.pointerEvents !== 'none' && !disabled;
  });
}

async function triggerInteraction(page, element, descriptor) {
  if (descriptor.tagName === 'form') {
    await element.evaluate((form) => {
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);
      if (!submitEvent.defaultPrevented && typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      }
    });
    return;
  }

  await Promise.race([
    element.click({ delay: 20 }),
    wait(INTERACTION_TIMEOUT_MS).then(() => {
      throw new Error('interaction timed out');
    }),
  ]);
  await page.waitForNetworkIdle({ idleTime: 500, timeout: INTERACTION_TIMEOUT_MS }).catch(() => {});
}

async function waitForInteraction(page) {
  await Promise.race([page.waitForNetworkIdle({ idleTime: 500, timeout: INTERACTION_TIMEOUT_MS }), wait(1000)]).catch(() => {});
}

async function disposeElements(elements) {
  await Promise.all(elements.map((element) => element.dispose().catch(() => {})));
}

function createRequestSnapshot(request) {
  return {
    url: request.url(),
    method: request.method(),
    headers: request.headers(),
    resourceType: request.resourceType(),
  };
}

function inferEndpointFromAction(actionName) {
  const value = String(actionName);
  if (value.startsWith('/') || /^https?:\/\//i.test(value)) {
    return value;
  }

  return value.replace(/(?:request|success|failure|pending|fulfilled|rejected)$/i, '').replace(/[:_]+$/g, '');
}

function resolveRedirectLocation(baseUrl, location) {
  if (!location) {
    return null;
  }

  try {
    return new URL(location, baseUrl).toString();
  } catch {
    return location;
  }
}

function dedupeApis(apis) {
  const seen = new Set();

  return apis.filter((api) => {
    const key = `${api.source}|${api.method ?? ''}|${api.url ?? api.endpoint ?? ''}|${api.action ?? ''}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
