import { describe, expect, it } from 'vitest';

import { RateLimitTracker } from '../../../src/providers/github/rate-limit.js';

const headers = (values: Readonly<Record<string, string>>): Headers => new Headers(values);

const tracker = (overrides: Readonly<Record<string, number>> = {}): RateLimitTracker =>
  new RateLimitTracker({ warnAtPercentConsumed: 50, stopAtPercentConsumed: 90, ...overrides });

describe('RateLimitTracker', () => {
  it('proceeds until GitHub reports consumption', () => {
    const limits = tracker({ coreLimit: 100 });
    expect(limits.decide('core')).toEqual({ kind: 'proceed' });

    limits.recordResponse('core', 200, headers({ 'x-ratelimit-remaining': '49' }));
    expect(limits.decide('core')).toEqual({ kind: 'warn', percentConsumed: 51 });
  });

  it('warns once and then stops, rather than warning on every request', () => {
    const limits = tracker({ coreLimit: 100 });
    limits.recordResponse('core', 200, headers({ 'x-ratelimit-remaining': '40' }));

    expect(limits.decide('core')).toEqual({ kind: 'warn', percentConsumed: 60 });
    expect(limits.decide('core')).toEqual({ kind: 'proceed' });

    limits.recordResponse('core', 200, headers({ 'x-ratelimit-remaining': '5' }));
    expect(limits.decide('core')).toEqual({
      kind: 'stop',
      percentConsumed: 95,
      bucket: 'core',
    });
  });

  it('trusts GitHub over its own configured limit when the headers arrive', () => {
    const limits = tracker({ coreLimit: 100 });
    limits.recordResponse(
      'core',
      200,
      headers({ 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '4000' }),
    );

    // Against the configured limit of 100 this would read as long past stopping; against
    // the real 5000-request bucket it is 20% consumed.
    expect(limits.decide('core')).toEqual({ kind: 'proceed' });
    expect(limits.usage().primaryRequests).toBe(1);
  });

  it('decrements its own estimate when a response carries no rate-limit headers', () => {
    const limits = tracker({ coreLimit: 4 });
    limits.recordResponse('core', 200, headers({}));
    limits.recordResponse('core', 200, headers({}));

    expect(limits.decide('core')).toEqual({ kind: 'warn', percentConsumed: 50 });
  });

  it('keeps a 304 out of the primary count, because it costs no quota', () => {
    const limits = tracker({ coreLimit: 100 });
    limits.recordResponse('core', 304, headers({}));
    limits.recordResponse('core', 200, headers({}));

    expect(limits.usage()).toEqual({
      primaryRequests: 1,
      searchRequests: 0,
      notModifiedResponses: 1,
      retries: 0,
    });
  });

  it('accounts for search separately, so an exhausted core budget is not inferred from it', () => {
    const limits = tracker({ coreLimit: 100, searchLimit: 10 });
    limits.recordResponse('search', 200, headers({ 'x-ratelimit-remaining': '0' }));

    expect(limits.decide('search')).toEqual({
      kind: 'stop',
      percentConsumed: 100,
      bucket: 'search',
    });
    expect(limits.decide('core')).toEqual({ kind: 'proceed' });
    expect(limits.usage()).toMatchObject({ primaryRequests: 0, searchRequests: 1 });
  });

  it('ignores header values that are not plain non-negative integers', () => {
    const limits = tracker({ coreLimit: 100 });
    for (const remaining of ['', 'unknown', '-1', '1e3', '9007199254740993']) {
      limits.recordResponse('core', 200, headers({ 'x-ratelimit-remaining': remaining }));
    }

    // Five responses, no usable header: the estimate fell by exactly one each time,
    // which is the fallback that keeps a stop reachable when GitHub tells us nothing.
    expect(limits.decide('core')).toEqual({ kind: 'proceed' });
    expect(limits.usage().primaryRequests).toBe(5);
  });

  it('reads a header the Headers API has trimmed for us', () => {
    // Not a curiosity: `Headers` strips surrounding whitespace before any of this code
    // sees the value, so ` 5` is a real 5 in production too, not a rejected malformation.
    const limits = tracker({ coreLimit: 100 });
    limits.recordResponse('core', 200, headers({ 'x-ratelimit-remaining': ' 5 ' }));

    expect(limits.decide('core')).toEqual({ kind: 'stop', percentConsumed: 95, bucket: 'core' });
  });

  it('treats a zero limit as fully consumed rather than dividing by it', () => {
    const limits = tracker({ coreLimit: 0 });
    expect(limits.decide('core')).toEqual({ kind: 'stop', percentConsumed: 100, bucket: 'core' });
  });

  it('counts retries for the usage report', () => {
    const limits = tracker();
    limits.recordRetry();
    limits.recordRetry();
    expect(limits.usage().retries).toBe(2);
  });
});
