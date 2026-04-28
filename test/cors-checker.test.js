import nock from 'nock';

import { checkCORS } from '../lib/cors-checker.js';

describe('checkCORS', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  test('reports endpoints that allow wildcard or reflected origins', async () => {
    nock('https://api.example.test')
      .options('/wildcard')
      .reply(204, '', { 'access-control-allow-origin': '*' })
      .options('/reflected')
      .reply(204, '', { 'access-control-allow-origin': 'https://evil.com' });

    const result = await checkCORS(['https://api.example.test/wildcard', { url: 'https://api.example.test/reflected' }]);

    expect(result.vulnerable).toEqual(
      expect.arrayContaining([
        { endpoint: 'https://api.example.test/wildcard', origin: 'https://evil.com', acao: '*' },
        { endpoint: 'https://api.example.test/reflected', origin: 'https://evil.com', acao: 'https://evil.com' },
      ]),
    );
  });

  test('does not report secure CORS responses', async () => {
    nock('https://api.example.test')
      .options('/secure')
      .reply(204, '', { 'access-control-allow-origin': 'https://trusted.example.test' })
      .get('/secure')
      .reply(200, { ok: true }, { 'access-control-allow-origin': 'https://trusted.example.test' });

    const result = await checkCORS('https://api.example.test/secure');

    expect(result.vulnerable).toEqual([]);
  });

  test('continues when an endpoint request fails', async () => {
    nock('https://api.example.test').options('/down').replyWithError('socket hang up').get('/down').reply(500);

    const result = await checkCORS('https://api.example.test/down');

    expect(result.vulnerable).toEqual([]);
  });
});
