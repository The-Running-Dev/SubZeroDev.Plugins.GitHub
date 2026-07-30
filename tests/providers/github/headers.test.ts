import { describe, expect, it } from 'vitest';

import { parseLastPage } from '../../../src/providers/github/link-header.js';
import { parseRetryAfterMilliseconds } from '../../../src/providers/github/retry-after.js';
import { githubUrl } from '../../../src/providers/github/urls.js';

const link = (value: string | null): number | null => parseLastPage(value);

describe('parseLastPage', () => {
  it('reads the last page from a full GitHub Link header', () => {
    expect(
      link(
        '<https://api.github.com/user/repos?per_page=1&page=2>; rel="next", ' +
          '<https://api.github.com/user/repos?per_page=1&page=417>; rel="last"',
      ),
    ).toBe(417);
  });

  it('is absent on the only page, which is how a single-page count is recognised', () => {
    expect(link(null)).toBeNull();
    expect(link('<https://api.github.com/user/repos?page=2>; rel="next"')).toBeNull();
  });

  it('accepts an unquoted rel and ignores parameter order', () => {
    expect(link('<https://api.github.com/x?page=3&per_page=1>; rel=last')).toBe(3);
  });

  it('refuses a rel="last" with no usable page number', () => {
    expect(link('<https://api.github.com/x>; rel="last"')).toBeNull();
    expect(link('<https://api.github.com/x?page=0>; rel="last"')).toBeNull();
  });

  it('does not mistake rel="first" for rel="last"', () => {
    expect(link('<https://api.github.com/x?page=1>; rel="first"')).toBeNull();
  });
});

describe('githubUrl', () => {
  it('keeps a path prefix on the base, which a root-relative reference would drop', () => {
    // `new URL('/user', 'https://github.example.com/api/v3')` resolves to
    // `https://github.example.com/user` — the whole reason this helper exists.
    expect(githubUrl('https://github.example.com/api/v3', 'user').toString()).toBe(
      'https://github.example.com/api/v3/user',
    );
    expect(githubUrl('https://github.example.com/api/v3/', 'user').toString()).toBe(
      'https://github.example.com/api/v3/user',
    );
  });

  it('tolerates a leading slash on the path without dropping the prefix', () => {
    expect(githubUrl('https://github.example.com/api/v3', '/user/repos').toString()).toBe(
      'https://github.example.com/api/v3/user/repos',
    );
  });

  it('builds the plain github.com form unchanged', () => {
    expect(githubUrl('https://api.github.com', 'user/repos').toString()).toBe(
      'https://api.github.com/user/repos',
    );
  });

  it('appends query parameters in the order given', () => {
    expect(
      githubUrl('https://api.github.com', 'user/repos', {
        affiliation: 'owner',
        per_page: '100',
      }).toString(),
    ).toBe('https://api.github.com/user/repos?affiliation=owner&per_page=100');
  });
});

describe('parseRetryAfterMilliseconds', () => {
  const now = new Date('2026-07-30T12:00:00Z');
  const parse = (value: string | null): number | null =>
    parseRetryAfterMilliseconds(new Headers(value === null ? {} : { 'retry-after': value }), now);

  it('reads delta-seconds, which is what GitHub sends', () => {
    expect(parse('30')).toBe(30_000);
    expect(parse('0')).toBe(0);
  });

  it('reads the HTTP-date form a proxy may send instead', () => {
    expect(parse('Thu, 30 Jul 2026 12:00:45 GMT')).toBe(45_000);
  });

  it('treats a date already past as retry-now, never as a negative wait', () => {
    expect(parse('Thu, 30 Jul 2026 11:59:00 GMT')).toBe(0);
  });

  it('is null when absent, empty, or unparseable', () => {
    expect(parse(null)).toBeNull();
    expect(parse('   ')).toBeNull();
    expect(parse('soon')).toBeNull();
  });

  it('refuses what Date.parse would happily misread', () => {
    // Each of these is a real Date.parse result in 2001 rather than NaN, so accepting
    // them would mean waiting 0 ms after being told to back off.
    expect(Number.isNaN(Date.parse('-5'))).toBe(false);
    expect(parse('-5')).toBeNull();
    expect(parse('5.5')).toBeNull();
    expect(parse('+5')).toBeNull();
    // Valid ISO 8601, but not the grammar this header uses.
    expect(parse('2026-07-30T12:00:45Z')).toBeNull();
  });
});
