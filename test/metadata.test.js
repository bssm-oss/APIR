import nock from 'nock';

import { extractMetadata } from '../server/phases/metadata.js';

describe('extractMetadata', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  test('extracts API evidence from robots, sitemap, JSON-LD, Open Graph, and Swagger docs', async () => {
    const swaggerSchema = { openapi: '3.0.0', paths: { '/api/users': { get: {} } } };

    nock('https://example.test')
      .get('/robots.txt')
      .reply(200, 'User-agent: *\nDisallow: /api/private\nDisallow: /assets')
      .get('/sitemap.xml')
      .reply(200, '<urlset><url><loc>https://example.test/api/from-sitemap</loc></url></urlset>')
      .get('/')
      .reply(
        200,
        `<html>
          <script type="application/ld+json">{"@context":"https://schema.org","@id":"https://example.test/api/entity"}</script>
          <meta property="og:url" content="https://example.test/api/open-graph">
        </html>`,
      )
      .get('/swagger.json')
      .reply(200, swaggerSchema)
      .get('/openapi.json')
      .reply(404)
      .get('/api-docs')
      .reply(404)
      .get('/redoc')
      .reply(404);

    const result = await extractMetadata('https://example.test/');

    expect(result.errors).toEqual([]);
    expect(result.metadata.robotsPaths).toContain('/api/private');
    expect(result.metadata.sitemapUrls).toContain('https://example.test/api/from-sitemap');
    expect(result.metadata.ldJsonData).toHaveLength(1);
    expect(JSON.parse(result.metadata.discoveredDocs['/swagger.json'])).toEqual(swaggerSchema);
    expect(result.apis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: 'https://example.test/api/private', evidence: 'robots.txt disallow path' }),
        expect.objectContaining({ url: 'https://example.test/api/from-sitemap', evidence: 'sitemap.xml url' }),
        expect.objectContaining({ url: 'https://example.test/api/entity', evidence: 'json-ld @id' }),
        expect.objectContaining({ url: 'https://example.test/api/open-graph', evidence: 'open graph api keyword' }),
        expect.objectContaining({ url: 'https://example.test/swagger.json', confidence: 'high' }),
      ]),
    );
  });

  test('records parse and probe errors while treating 404s as absent metadata', async () => {
    nock('https://example.test')
      .get('/robots.txt')
      .reply(500, 'server error')
      .get('/sitemap.xml')
      .reply(200, '<urlset>')
      .get('/bad')
      .reply(404)
      .get('/swagger.json')
      .reply(404)
      .get('/openapi.json')
      .reply(503, 'unavailable')
      .get('/api-docs')
      .reply(404)
      .get('/redoc')
      .reply(404);

    const result = await extractMetadata('https://example.test/bad');

    expect(result.apis).toEqual([]);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'FETCH_FAILED', message: expect.stringContaining('robots.txt fetch failed'), phase: 'metadata' }),
        expect.objectContaining({ code: 'PARSE_FAILED', message: expect.stringContaining('sitemap.xml parse failed'), phase: 'metadata' }),
        expect.objectContaining({ code: 'FETCH_FAILED', message: expect.stringContaining('/openapi.json probe failed'), phase: 'metadata' }),
      ]),
    );
  });
});
