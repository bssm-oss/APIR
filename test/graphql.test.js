import { jest } from '@jest/globals';

import { analyzeGraphQL } from '../server/phases/graphql.js';

function createNotFoundError() {
  const error = new Error('not found');
  error.response = { status: 404, data: 'not found' };
  return error;
}

describe('analyzeGraphQL', () => {
  test('probes metadata-discovered GraphQL paths in addition to the default endpoint', async () => {
    const calls = [];
    const schema = { types: [{ name: 'Query', kind: 'OBJECT', fields: [] }] };
    const httpClient = {
      post: jest.fn(async (url) => {
        calls.push(['POST', url]);
        if (url === 'https://example.test/api/graphql') {
          return { status: 200, data: { data: { __schema: schema } } };
        }
        throw createNotFoundError();
      }),
      get: jest.fn(async (url) => {
        calls.push(['GET', url]);
        throw createNotFoundError();
      }),
    };

    const result = await analyzeGraphQL('https://example.test/app', httpClient, {}, [
      '/api/graphql',
      '/graphql',
      'https://example.test/api/graphql',
    ]);

    expect(calls).toEqual([
      ['POST', 'https://example.test/graphql'],
      ['GET', 'https://example.test/graphql'],
      ['POST', 'https://example.test/api/graphql'],
    ]);
    expect(result.errors).toEqual([]);
    expect(result.schemaInference.introspectionPossible).toBe(true);
    expect(result.apis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: 'https://example.test/api/graphql', evidence: 'graphql introspection schema' }),
      ]),
    );
  });
});
