import { fingerprint } from '../lib/fingerprint.js';

describe('fingerprint', () => {
  test('parses server, framework, and Cloudflare via headers', () => {
    const result = fingerprint({
      Server: 'nginx/1.25.3 Ubuntu',
      'X-Powered-By': 'Express, Next.js',
      'x-cf-via': 'cloudflare',
    });

    expect(result).toEqual({
      server: 'nginx 1.25.3',
      framework: 'Express',
      via: 'Cloudflare (cloudflare)',
      estimatedStack: 'nginx 1.25.3 + Express + Cloudflare (cloudflare)',
    });
  });

  test('supports Headers-like objects and empty input', () => {
    const headers = new Map([
      ['server', 'Apache'],
      ['x-powered-by', 'PHP/8.2'],
    ]);

    expect(fingerprint(headers)).toEqual({
      server: 'Apache',
      framework: 'PHP/8.2',
      via: '',
      estimatedStack: 'Apache + PHP/8.2',
    });
    expect(fingerprint()).toEqual({ server: '', framework: '', via: '', estimatedStack: '' });
  });

  test('joins repeated header values before parsing', () => {
    const result = fingerprint({ server: ['Caddy/2.7.6', 'edge'], 'x-cf-via': 'cache' });

    expect(result.server).toBe('Caddy 2.7.6,');
    expect(result.via).toBe('cache');
  });
});
