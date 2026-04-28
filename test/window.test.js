import { jest } from '@jest/globals';

import { harvestWindowObject } from '../server/phases/window.js';

function createHttpClient(html) {
  return {
    get: jest.fn().mockResolvedValue({ data: html }),
  };
}

describe('harvestWindowObject', () => {
  test('extracts API strings from common framework state containers', async () => {
    const html = `
      <script>window.__NUXT__ = { data: [{ endpoint: '/api/nuxt-users' }] };</script>
      <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"api":"/api/next-data"}}}</script>
      <script>window.__APOLLO_STATE__ = { ROOT_QUERY: { viewer: 'https://api.example.test/viewer' } };</script>
    `;

    const result = await harvestWindowObject('https://example.test/', createHttpClient(html));

    expect(result.errors).toEqual([]);
    expect(result.metadata.frameworkState).toEqual(
      expect.objectContaining({
        __NUXT__: expect.any(Object),
        __NEXT_DATA__: expect.any(Object),
        __APOLLO_STATE__: expect.any(Object),
      }),
    );
    expect(result.apis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ endpoint: '/api/nuxt-users', foundIn: '__NUXT__' }),
        expect.objectContaining({ endpoint: '/api/next-data', foundIn: '__NEXT_DATA__' }),
        expect.objectContaining({ endpoint: 'https://api.example.test/viewer', foundIn: '__APOLLO_STATE__' }),
      ]),
    );
  });

  test('handles circular framework state while preserving metadata', async () => {
    const html = `
      <script>
        const circularState = { api: '/api/circular' };
        circularState.self = circularState;
        window.__REDUX_STATE__ = circularState;
      </script>
    `;

    const result = await harvestWindowObject('https://example.test/', createHttpClient(html));

    expect(result.errors).toEqual([]);
    expect(result.apis).toEqual([expect.objectContaining({ endpoint: '/api/circular' })]);
    expect(result.metadata.frameworkState.__REDUX_STATE__.self).toBe('[Circular]');
  });

  test('records malformed inline scripts and continues with other state', async () => {
    const html = `
      <script>window.__NUXT__ = { api: '/api/good' };</script>
      <script>function () {</script>
      <script id="__NEXT_DATA__" type="application/json">{not json}</script>
    `;

    const result = await harvestWindowObject('https://example.test/', createHttpClient(html));

    expect(result.apis).toEqual([expect.objectContaining({ endpoint: '/api/good' })]);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('inline script skipped'), expect.stringContaining('JSON parse failed')]),
    );
  });

  test('returns empty results when the HTML fetch fails', async () => {
    const result = await harvestWindowObject('https://example.test/', {
      get: jest.fn().mockRejectedValue(new Error('network unavailable')),
    });

    expect(result.apis).toEqual([]);
    expect(result.errors).toEqual(['window harvest failed: network unavailable']);
    expect(result.metadata.frameworkState).toEqual({});
  });
});
