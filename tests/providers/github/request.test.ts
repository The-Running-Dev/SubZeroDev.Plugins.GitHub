import { afterEach, describe, expect, it } from 'vitest';

import type { Logger } from '../../../src/logging/logger.js';
import { clearRegisteredSecrets, registerSecret } from '../../../src/logging/secret-registry.js';
import {
  GitHubRequester,
  type TransientRetryPolicy,
} from '../../../src/providers/github/request.js';
import { RateLimitTracker } from '../../../src/providers/github/rate-limit.js';
import { fakeClock, fakeSleeper, type FakeSleeper } from '../../support/fake-ports.js';
import { createFetchStub, type StubResponse } from '../../support/fetch-stub.js';

interface RecordingLogger extends Logger {
  readonly warnings: readonly string[];
}

function recordingLogger(): RecordingLogger {
  const warnings: string[] = [];
  const logger: RecordingLogger = {
    warnings,
    error: () => undefined,
    warn: (message: string) => {
      warnings.push(message);
    },
    info: () => undefined,
    debug: () => undefined,
    trace: () => undefined,
    child: () => logger,
  };
  return logger;
}

const budget = { warnAtPercentConsumed: 50, stopAtPercentConsumed: 90 };

function requester(
  fetch: typeof globalThis.fetch,
  overrides: {
    readonly tracker?: RateLimitTracker;
    readonly sleeper?: FakeSleeper;
    readonly logger?: Logger;
    readonly transientRetry?: TransientRetryPolicy;
    readonly clock?: ReturnType<typeof fakeClock>;
    readonly searchRequestsPerMinute?: number;
  } = {},
) {
  return new GitHubRequester({
    fetch,
    token: 'token-canary-value',
    userAgent: 'test-agent',
    logger: overrides.logger ?? recordingLogger(),
    sleeper: overrides.sleeper ?? fakeSleeper(),
    clock: overrides.clock ?? fakeClock(),
    rateLimits: overrides.tracker ?? new RateLimitTracker(budget),
    random: () => 0.5,
    ...(overrides.transientRetry === undefined ? {} : { transientRetry: overrides.transientRetry }),
    ...(overrides.searchRequestsPerMinute === undefined
      ? {}
      : { searchRequestsPerMinute: overrides.searchRequestsPerMinute }),
  });
}

function route(respond: (callIndex: number) => StubResponse) {
  return createFetchStub([
    {
      method: 'GET',
      pathPattern: /^\/resource/,
      respond: (_request, callIndex) => respond(callIndex),
    },
  ]);
}

const spec = {
  resource: 'authenticated-user',
  url: 'https://example.test/resource',
  bucket: 'core',
} as const;

afterEach(() => {
  clearRegisteredSecrets();
});

describe('GitHubRequester conditional requests', () => {
  it('sends the ETag and counts a 304 separately from primary quota', async () => {
    const stub = route(() => ({ status: 304, headers: { etag: '"next"' } }));
    const client = requester(stub.fetch);

    const result = await client.get(
      { ...spec, etag: '"old"', acceptNotModified: true },
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

  it('refuses a 304 the caller did not ask for rather than reporting empty data', async () => {
    const stub = route(() => ({ status: 304 }));
    const result = await requester(stub.fetch).get(spec, (value) => value);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('github_unexpected_response');
  });

  it('reads the Link header off a page response', async () => {
    const stub = route(() => ({
      status: 200,
      headers: {
        link: '<https://api.github.com/user/repos?page=4>; rel="next", <https://api.github.com/user/repos?page=9>; rel="last"',
      },
      body: [],
    }));
    const result = await requester(stub.fetch).get(spec, (value) => value);

    expect(result).toMatchObject({ ok: true, value: { linkLastPage: 9 } });
  });
});

describe('GitHubRequester statistics settling', () => {
  it('reports not-settled once the retry budget is spent, never a 202 as an outcome', async () => {
    const sleeper = fakeSleeper();
    const stub = route(() => ({ status: 202 }));
    const client = requester(stub.fetch, { sleeper });

    const result = await client.get(
      {
        resource: 'repository-statistics:42',
        url: 'https://example.test/resource',
        bucket: 'core',
        subject: 'repository:42',
        settleRetry: { attempts: 2, baseMilliseconds: 100 },
      },
      (value) => value,
    );

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toMatchObject({
        kind: 'not-settled',
        code: 'github_statistics_not_settled',
        subject: 'repository:42',
        status: 202,
        retryable: true,
      });
    // Three requests, two waits: full jitter against the injected random source.
    expect(stub.requests).toHaveLength(3);
    expect(sleeper.slept).toEqual([50, 100]);
    expect(client.usage().retries).toBe(2);
  });

  it('does not wait at all when no settle retry was configured', async () => {
    const sleeper = fakeSleeper();
    const stub = route(() => ({ status: 202 }));
    const result = await requester(stub.fetch, { sleeper }).get(spec, (value) => value);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('not-settled');
    expect(stub.requests).toHaveLength(1);
    expect(sleeper.slept).toEqual([]);
  });

  it('honours Retry-After on a 202 rather than polling on its own schedule', async () => {
    const sleeper = fakeSleeper();
    const stub = route((callIndex) =>
      callIndex === 0
        ? { status: 202, headers: { 'retry-after': '3' } }
        : { status: 200, body: { total: 1 } },
    );
    const result = await requester(stub.fetch, { sleeper }).get(
      {
        resource: 'repository-statistics:42',
        url: 'https://example.test/resource',
        bucket: 'core',
        settleRetry: { attempts: 3, baseMilliseconds: 100 },
      },
      (value) => value,
    );

    expect(result.ok).toBe(true);
    // 3000, not the 50 the jittered schedule would have chosen.
    expect(sleeper.slept).toEqual([3_000]);
  });

  it('gives up rather than waiting past the ceiling for statistics', async () => {
    const sleeper = fakeSleeper();
    const stub = route(() => ({ status: 202, headers: { 'retry-after': '600' } }));
    const result = await requester(stub.fetch, {
      sleeper,
      transientRetry: { attempts: 2, baseMilliseconds: 100, maximumDelayMilliseconds: 15_000 },
    }).get(
      {
        resource: 'repository-statistics:42',
        url: 'https://example.test/resource',
        bucket: 'core',
        settleRetry: { attempts: 3, baseMilliseconds: 100 },
      },
      (value) => value,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('not-settled');
    expect(stub.requests).toHaveLength(1);
    expect(sleeper.slept).toEqual([]);
  });

  it('returns data as soon as GitHub settles', async () => {
    const stub = route((callIndex) =>
      callIndex === 0 ? { status: 202 } : { status: 200, body: { total: 7 } },
    );
    const result = await requester(stub.fetch).get(
      {
        resource: 'repository-statistics:42',
        url: 'https://example.test/resource',
        bucket: 'core',
        settleRetry: { attempts: 3, baseMilliseconds: 100 },
      },
      (value) => value,
    );

    expect(result).toMatchObject({ ok: true, value: { status: 200, data: { total: 7 } } });
  });
});

describe('GitHubRequester error classification', () => {
  const cases = [
    { status: 401, kind: 'unauthenticated', retryable: false },
    { status: 404, kind: 'not-found', retryable: false },
    { status: 429, kind: 'rate-limited', retryable: true },
    { status: 418, kind: 'response-shape', retryable: false },
  ] as const;

  for (const expected of cases) {
    it(`classifies ${String(expected.status)} as ${expected.kind}`, async () => {
      const stub = route(() => ({ status: expected.status, body: { message: 'no' } }));
      const result = await requester(stub.fetch, {
        transientRetry: { attempts: 0, baseMilliseconds: 1, maximumDelayMilliseconds: 1 },
      }).get(spec, (value) => value);

      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.error).toMatchObject({
          kind: expected.kind,
          retryable: expected.retryable,
          status: expected.status,
        });
    });
  }

  it('separates a forbidden 403 from an exhausted primary limit', async () => {
    const forbidden = route(() => ({ status: 403, body: { message: 'Resource not accessible' } }));
    const plainResult = await requester(forbidden.fetch).get(spec, (value) => value);
    expect(plainResult.ok).toBe(false);
    if (!plainResult.ok)
      expect(plainResult.error).toMatchObject({ kind: 'forbidden', retryable: false });

    const exhausted = route(() => ({
      status: 403,
      headers: { 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '0' },
      body: { message: 'API rate limit exceeded' },
    }));
    const limitedResult = await requester(exhausted.fetch).get(spec, (value) => value);
    expect(limitedResult.ok).toBe(false);
    if (!limitedResult.ok)
      expect(limitedResult.error).toMatchObject({ kind: 'rate-limited', retryable: true });
  });

  it('classifies a secondary rate limit and interpolates no response body into the message', async () => {
    const stub = route(() => ({
      status: 403,
      headers: { 'retry-after': '30' },
      body: { message: 'You have exceeded a secondary rate limit. token-canary-value' },
    }));

    const result = await requester(stub.fetch).get(spec, (value) => value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('secondary-rate-limit');
      // Asserted as equality, not as "does not contain the canary": the guarantee is
      // that no response body reaches a message at all, and a not-contains assertion
      // passes just as well against a message that never had anywhere to leak from.
      expect(result.error.message).toBe('GitHub secondary rate limit is active.');
    }
  });

  it('scrubs a registered token out of a network error message', async () => {
    expect(registerSecret('token-canary-value')).toBe(true);
    const failing: typeof globalThis.fetch = () =>
      Promise.reject(
        new Error('connect ECONNREFUSED https://api.github.com/user?token=token-canary-value'),
      );

    const result = await requester(failing, {
      transientRetry: { attempts: 0, baseMilliseconds: 1, maximumDelayMilliseconds: 1 },
    }).get(spec, (value) => value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('network');
      expect(result.error.message).not.toContain('token-canary-value');
      expect(result.error.message).toContain('[redacted]');
    }
  });

  it('reports invalid JSON and a failed parse as non-retryable shape errors', async () => {
    // Bypassing the stub deliberately: it JSON-encodes every body, so truncated bytes
    // are the one response it cannot express.
    const brokenBytes: typeof globalThis.fetch = () =>
      Promise.resolve(new Response('{"truncated"', { status: 200 }));
    const invalidResult = await requester(brokenBytes).get(spec, (value) => value);
    expect(invalidResult.ok).toBe(false);
    if (!invalidResult.ok)
      expect(invalidResult.error).toMatchObject({
        code: 'github_invalid_json',
        kind: 'response-shape',
        retryable: false,
      });

    const drift = route(() => ({ status: 200, body: { unexpected: true } }));
    const driftResult = await requester(drift.fetch).get(spec, () => {
      throw new Error('shape');
    });
    expect(driftResult.ok).toBe(false);
    if (!driftResult.ok)
      expect(driftResult.error).toMatchObject({
        code: 'github_response_shape',
        retryable: false,
      });
  });
});

describe('GitHubRequester transient retry', () => {
  it('retries a 5xx with capped exponential backoff and full jitter', async () => {
    const sleeper = fakeSleeper();
    const stub = route((callIndex) =>
      callIndex < 2 ? { status: 502 } : { status: 200, body: { ok: true } },
    );
    const client = requester(stub.fetch, {
      sleeper,
      transientRetry: { attempts: 3, baseMilliseconds: 400, maximumDelayMilliseconds: 600 },
    });

    const result = await client.get(spec, (value) => value);

    expect(result).toMatchObject({ ok: true, value: { data: { ok: true } } });
    // 0.5 × 400, then 0.5 × min(800, 600) — the cap binds on the second wait.
    expect(sleeper.slept).toEqual([200, 300]);
    expect(client.usage()).toMatchObject({ primaryRequests: 3, retries: 2 });
  });

  it('retries a network interruption and gives up with the classified error', async () => {
    const sleeper = fakeSleeper();
    let calls = 0;
    const failing: typeof globalThis.fetch = () => {
      calls += 1;
      return Promise.reject(new Error('socket hang up'));
    };
    const client = requester(failing, {
      sleeper,
      transientRetry: { attempts: 2, baseMilliseconds: 100, maximumDelayMilliseconds: 1_000 },
    });

    const result = await client.get(spec, (value) => value);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ kind: 'network', retryable: true });
    expect(calls).toBe(3);
    expect(sleeper.slept).toEqual([50, 100]);
    expect(client.usage().retries).toBe(2);
  });

  it('honours Retry-After in seconds instead of its own backoff', async () => {
    const sleeper = fakeSleeper();
    const stub = route((callIndex) =>
      callIndex === 0
        ? { status: 503, headers: { 'retry-after': '3' } }
        : { status: 200, body: { ok: true } },
    );
    const result = await requester(stub.fetch, {
      sleeper,
      transientRetry: { attempts: 2, baseMilliseconds: 100, maximumDelayMilliseconds: 10_000 },
    }).get(spec, (value) => value);

    expect(result.ok).toBe(true);
    expect(sleeper.slept).toEqual([3_000]);
  });

  it('honours an HTTP-date Retry-After against the injected clock', async () => {
    const clock = fakeClock(new Date('2026-07-30T12:00:00Z'));
    const sleeper = fakeSleeper();
    const stub = route((callIndex) =>
      callIndex === 0
        ? { status: 503, headers: { 'retry-after': 'Thu, 30 Jul 2026 12:00:05 GMT' } }
        : { status: 200, body: { ok: true } },
    );
    const result = await requester(stub.fetch, { sleeper, clock }).get(spec, (value) => value);

    expect(result.ok).toBe(true);
    expect(sleeper.slept).toEqual([5_000]);
  });

  it('abandons rather than waiting longer than the policy allows', async () => {
    const sleeper = fakeSleeper();
    const stub = route(() => ({ status: 503, headers: { 'retry-after': '600' } }));
    const result = await requester(stub.fetch, {
      sleeper,
      transientRetry: { attempts: 3, baseMilliseconds: 100, maximumDelayMilliseconds: 15_000 },
    }).get(spec, (value) => value);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('server-error');
    expect(stub.requests).toHaveLength(1);
    expect(sleeper.slept).toEqual([]);
  });

  it('never retries a rate limit, a 404, or provider drift', async () => {
    for (const response of [
      { status: 429 },
      { status: 403, headers: { 'x-ratelimit-remaining': '0' } },
      { status: 403, headers: { 'retry-after': '1' }, body: { message: 'secondary rate limit' } },
      { status: 404 },
    ] satisfies StubResponse[]) {
      const sleeper = fakeSleeper();
      const stub = route(() => response);
      const result = await requester(stub.fetch, { sleeper }).get(spec, (value) => value);

      expect(result.ok).toBe(false);
      expect(stub.requests).toHaveLength(1);
      expect(sleeper.slept).toEqual([]);
    }
  });
});

describe('GitHubRequester budget guard', () => {
  it('warns once and then stops without issuing the request', async () => {
    const logger = recordingLogger();
    const tracker = new RateLimitTracker({
      warnAtPercentConsumed: 50,
      stopAtPercentConsumed: 90,
      coreLimit: 10,
    });
    // 60% consumed, 60% again — the warning fires once, not per request — then 100%.
    const stub = route((callIndex) => ({
      status: 200,
      headers: {
        'x-ratelimit-limit': '10',
        'x-ratelimit-remaining': callIndex < 2 ? '4' : '0',
      },
      body: {},
    }));
    const client = requester(stub.fetch, { tracker, logger });

    await client.get(spec, (value) => value);
    await client.get(spec, (value) => value);
    await client.get(spec, (value) => value);
    const stopped = await client.get(spec, (value) => value);

    expect(logger.warnings).toEqual(['GitHub request budget is nearing its limit.']);
    expect(stopped.ok).toBe(false);
    if (!stopped.ok)
      expect(stopped.error).toMatchObject({ code: 'github_budget_stopped', kind: 'rate-limited' });
    // Three issued; the fourth never left the process.
    expect(stub.requests).toHaveLength(3);
  });

  it('stops a Search request before consuming a pacer admission', async () => {
    const clock = fakeClock();
    const sleeper = fakeSleeper(clock);
    const tracker = new RateLimitTracker({
      warnAtPercentConsumed: 50,
      stopAtPercentConsumed: 90,
      searchLimit: 10,
    });
    const stub = route(() => ({
      status: 200,
      headers: { 'x-ratelimit-limit': '10', 'x-ratelimit-remaining': '0' },
      body: {},
    }));
    const client = requester(stub.fetch, {
      clock,
      sleeper,
      tracker,
      searchRequestsPerMinute: 1,
    });
    const searchSpec = {
      ...spec,
      resource: 'search:42:is:pr is:open',
      bucket: 'search',
    } as const;

    await client.get(searchSpec, (value) => value);
    const stopped = await client.get(searchSpec, (value) => value);

    expect(stopped.ok).toBe(false);
    if (!stopped.ok) expect(stopped.error.code).toBe('github_budget_stopped');
    expect(stub.requests).toHaveLength(1);
    expect(sleeper.slept).toEqual([]);
  });
});
