import nock from 'nock';

import { extractSourceMaps } from '../server/phases/sourcemap.js';

function createInlineSourceMap(sourceContent, sourceName = 'src/api.js') {
  const sourceMap = {
    version: 3,
    file: 'app.js',
    sources: [sourceName],
    sourcesContent: [sourceContent],
    names: [],
    mappings: '',
  };

  return `data:application/json;base64,${Buffer.from(JSON.stringify(sourceMap)).toString('base64')}`;
}

describe('extractSourceMaps', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  test('extracts API paths from scripts with inline source maps', async () => {
    const sourceContent = [
      "const users = '/api/users';",
      "fetch('/graphql');",
      "axios.post('/api/orders');",
      '// TODO expose /api/admin later',
    ].join('\n');

    nock('https://example.test')
      .get('/')
      .reply(200, '<html><script src="/assets/app.js"></script></html>')
      .get('/assets/app.js')
      .reply(200, `console.log('bundle');\n//# sourceMappingURL=${createInlineSourceMap(sourceContent)}`);

    const result = await extractSourceMaps('https://example.test/');

    expect(result.errors).toEqual([]);
    expect(result.metadata).toMatchObject({ scriptsFound: 1, sourceMapsFound: 1, sourcesParsed: 1 });
    expect(result.apis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'UNKNOWN', path: '/api/users', source: 'sourcemap' }),
        expect.objectContaining({ method: 'UNKNOWN', path: '/graphql', source: 'sourcemap' }),
        expect.objectContaining({ method: 'POST', path: '/api/orders', source: 'sourcemap' }),
        expect.objectContaining({ path: 'TODO: expose /api/admin later', note: 'Recovered source comment' }),
      ]),
    );
  });

  test('reports no source maps when scripts do not reference a map', async () => {
    nock('https://example.test')
      .get('/missing-map')
      .reply(200, '<script src="/assets/no-map.js"></script>')
      .get('/assets/no-map.js')
      .reply(200, "fetch('/api/hidden')");

    const result = await extractSourceMaps('https://example.test/missing-map');

    expect(result.apis).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.metadata).toMatchObject({ scriptsFound: 1, sourceMapsFound: 0, sourcesParsed: 0 });
  });

  test('records source map fetch errors without crashing the phase', async () => {
    nock('https://example.test')
      .get('/broken-map')
      .reply(200, '<script src="/assets/app.js"></script>')
      .get('/assets/app.js')
      .reply(200, "console.log('bundle');\n//# sourceMappingURL=app.js.map")
      .get('/assets/app.js.map')
      .reply(404, 'not found');

    const result = await extractSourceMaps('https://example.test/broken-map');

    expect(result.apis).toEqual([]);
    expect(result.metadata.sourceMapsFound).toBe(0);
    expect(result.errors).toEqual([expect.stringContaining('Failed to process source map')]);
  });
});
