import { describe, expect, it } from 'vitest';

import type { Logger } from '../../../src/logging/logger.js';
import { GitHubRequester } from '../../../src/providers/github/request.js';
import { RateLimitTracker } from '../../../src/providers/github/rate-limit.js';
import { fakeClock, fakeSleeper } from '../../support/fake-ports.js';
import { createFetchStub } from '../../support/fetch-stub.js';

const logger: Logger = {
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  child: () => logger,
};

function requester(
  fetch: typeof globalThis.fetch,
  tracker = new RateLimitTracker({
    warnAtPercentConsumed: 50,
    stopAtPercentConsumed: 90,
    coreLimit: 10,
  }),
) {
  return new GitHubRequester({
    fetch,
    token: 'token-canary',
    userAgent: 'test-agent',
    logger,
    sleeper: fakeSleeper(),
    clock: fakeClock(),
    rateLimits: tracker,
    random: () => 0.5,
  });
}

describe('GitHubRequester', () => {
  it('sends ETags and counts a 304 separately from primary quota', async () => {
    const stub = createFetchStub([
      {
        method: 'GET',
        pathPattern: /^\/resource$/,
        respond: () => ({ status: 304, headers: { etag: '"next"' } }),
      },
    ]);
    const client = requester(stub.fetch);

    const result = await client.get(
      {
        resource: 'authenticated-user',
        url: 'https://example.test/resource',
        bucket: 'core',
        etag: '"old"',
        acceptNotModified: true,
      },
      (value) => value,
    );

    expect(result).toMatchObject({ ok: true, value: { notModified: true, data: null } });
    expect(stub.requests[0]?.headers['if-none-match']).toBe('"old"');
    expect(client.usage()).toEqual({
      primaryRequests: 0,
      searchRequests: 0,
      notModifiedResponses: 1,
      retries: 0,
    });
  });

  it('never returns data from a 202 statistics response and retries with injected time', async () => {
    const sleeper = fakeSleeper();
    const stub = createFetchStub([
      {
        method: 'GET',
        pathPattern: /^\/stats$/,
        respond: () => ({ status: 202 }),
      },
    ]);
    const client = new GitHubRequester({
      fetch: stub.fetch,
      token: 'token-canary',
      userAgent: 'test-agent',
      logger,
      sleeper,
      clock: fakeClock(),
      rateLimits: new RateLimitTracker({ warnAtPercentConsumed: 50, stopAtPercentConsumed: 90 }),
      random: () => 0.5,
    });

    const result = await client.get(
      {
        resource: 'repository-statistics:42',
        url: 'https://example.test/stats',
        bucket: 'core',
        settleRetry: { attempts: 2, baseMilliseconds: 100 },
      },
      (value) => value,
    );

    expect(result).toMatchObject({ ok: true, value: { status: 202, data: null } });
    expect(sleeper.slept).toEqual([50, 100]);
    expect(client.usage().retries).toBe(2);
  });

  it('classifies a secondary rate limit without exposing its token', async () => {
    const stub = createFetchStub([
      {
        method: 'GET',
        pathPattern: /^\/limited$/,
        respond: () => ({
          status: 403,
          headers: { 'retry-after': '30' },
          body: { message: 'secondary rate limit token-canary' },
        }),
      },
    ]);

    const result = await requester(stub.fetch).get(
      { resource: 'authenticated-user', url: 'https://example.test/limited', bucket: 'core' },
      (value) => value,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'secondary-rate-limit', retryable: true },
    });
    if (!result.ok) expect(result.error.message).not.toContain('token-canary');
  });
});
