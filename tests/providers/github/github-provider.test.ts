import { describe, expect, it } from 'vitest';

import type { ResolvedToken } from '../../../src/configuration/environment.js';
import type { Logger } from '../../../src/logging/logger.js';
import { GitHubProvider } from '../../../src/providers/github/github-provider.js';
import type { Outcome, ProviderError } from '../../../src/providers/outcome.js';
import type { DiscoveredRepository, RepositoryFilter } from '../../../src/providers/provider.js';
import { fakeClock, fakeSleeper } from '../../support/fake-ports.js';
import { createFetchStub, type FetchStub } from '../../support/fetch-stub.js';
import { repositoryPayload } from '../../support/github-payloads.js';

const logger: Logger = {
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  child: () => logger,
};

const token: ResolvedToken = {
  value: 'token-canary-value',
  source: 'environment',
  environmentVariable: 'GITHUB_TOKEN',
  credentialPath: null,
};

const everything: RepositoryFilter = {
  includeForks: true,
  includeArchived: true,
  includeTemplates: true,
  includeDisabled: true,
  includePrivate: true,
  includePublic: true,
  includeSlugs: [],
  excludeSlugs: [],
};

function provider(
  fetch: typeof globalThis.fetch,
  baseUrl = 'https://example.test',
): GitHubProvider {
  return new GitHubProvider({
    token,
    logger,
    sleeper: fakeSleeper(),
    clock: fakeClock(),
    budget: { warnAtPercentConsumed: 50, stopAtPercentConsumed: 90 },
    userAgent: 'test-agent',
    fetch,
    baseUrl,
  });
}

/** Serves `count` repositories across as many pages as the requested page size takes. */
function repositoryPages(count: number): FetchStub {
  const all = Array.from({ length: count }, (_, index) =>
    repositoryPayload({
      id: index + 1,
      name: `repository-${String(index + 1)}`,
      full_name: `octo/repository-${String(index + 1)}`,
    }),
  );
  return createFetchStub([
    {
      method: 'GET',
      pathPattern: /^\/user\/repos\?/,
      respond: (request) => {
        const page = Number(request.url.searchParams.get('page') ?? '1');
        const perPage = Number(request.url.searchParams.get('per_page') ?? '100');
        return { status: 200, body: all.slice((page - 1) * perPage, page * perPage) };
      },
    },
  ]);
}

function repositoryList(body: readonly Record<string, unknown>[]): FetchStub {
  return createFetchStub([
    { method: 'GET', pathPattern: /^\/user\/repos/, respond: () => ({ status: 200, body }) },
  ]);
}

async function discover(
  stub: FetchStub,
  filter: RepositoryFilter = everything,
): Promise<Outcome<DiscoveredRepository, ProviderError>[]> {
  const results: Outcome<DiscoveredRepository, ProviderError>[] = [];
  for await (const result of provider(stub.fetch).discover(filter)) results.push(result);
  return results;
}

const slugs = (results: readonly Outcome<DiscoveredRepository, ProviderError>[]): string[] =>
  results.flatMap((result) => (result.ok ? [result.value.repository.slug] : []));

describe('GitHubProvider connectivity', () => {
  it('reports the authenticated login, numeric owner identity, and token source', async () => {
    const stub = createFetchStub([
      {
        method: 'GET',
        pathPattern: /^\/user$/,
        respond: () => ({ status: 200, body: { login: 'octo', id: 9_876_543_210 } }),
      },
    ]);

    await expect(provider(stub.fetch).checkAccess()).resolves.toEqual({
      ok: true,
      value: { login: 'octo', ownerProviderId: '9876543210', tokenSource: 'environment' },
    });
  });

  it('classifies a rejected credential rather than throwing', async () => {
    const stub = createFetchStub([
      {
        method: 'GET',
        pathPattern: /^\/user$/,
        respond: () => ({ status: 401, body: { message: 'Bad credentials' } }),
      },
    ]);

    const result = await provider(stub.fetch).checkAccess();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('unauthenticated');
  });
});

describe('GitHubProvider against a base URL carrying a path prefix', () => {
  it('keeps the prefix on both the access check and every discovery page', async () => {
    const stub = createFetchStub([
      {
        method: 'GET',
        pathPattern: /^\/api\/v3\/user$/,
        respond: () => ({ status: 200, body: { login: 'octo', id: 1 } }),
      },
      {
        method: 'GET',
        pathPattern: /^\/api\/v3\/user\/repos\?/,
        respond: () => ({
          status: 200,
          body: [repositoryPayload({ id: 1, name: 'one', full_name: 'octo/one' })],
        }),
      },
    ]);
    const client = provider(stub.fetch, 'https://github.example.com/api/v3');

    await expect(client.checkAccess()).resolves.toMatchObject({ ok: true });
    const results: Outcome<DiscoveredRepository, ProviderError>[] = [];
    for await (const result of client.discover(everything)) results.push(result);

    expect(slugs(results)).toEqual(['octo/one']);
    // The unmatched-route check is the assertion: a dropped prefix would have requested
    // `/user` and `/user/repos`, which this stub answers with a 501.
    stub.assertNoUnmatchedRoutes();
    expect(stub.requests.map((request) => request.url.pathname)).toEqual([
      '/api/v3/user',
      '/api/v3/user/repos',
    ]);
  });
});

describe('GitHubProvider discovery', () => {
  // 100 is the page size, so 99/100/101 are where an off-by-one would live.
  for (const count of [0, 1, 99, 100, 101, 201]) {
    it(`discovers each of ${String(count)} repositories exactly once`, async () => {
      const stub = repositoryPages(count);
      const results = await discover(stub);

      expect(results).toHaveLength(count);
      expect(results.every((result) => result.ok)).toBe(true);
      expect(new Set(slugs(results)).size).toBe(count);
      // A full page must be followed by one more request; a short page must not be.
      expect(stub.requests).toHaveLength(Math.floor(count / 100) + 1);
      stub.assertNoUnmatchedRoutes();
    });
  }

  it('yields a repository once even when GitHub returns it on two pages', async () => {
    const first = Array.from({ length: 100 }, (_, index) =>
      repositoryPayload({
        id: index + 1,
        name: `r${String(index + 1)}`,
        full_name: `octo/r${String(index + 1)}`,
      }),
    );
    // A repository created mid-walk shifts the `full_name` window, so page 2 repeats the
    // last entry of page 1 — the pagination race the identity guard exists for.
    const stub = createFetchStub([
      {
        method: 'GET',
        pathPattern: /^\/user\/repos\?/,
        respond: (request) => ({
          status: 200,
          body:
            request.url.searchParams.get('page') === '1'
              ? first
              : [first[99], repositoryPayload({ id: 101, name: 'new', full_name: 'octo/new' })],
        }),
      },
    ]);

    const discovered = slugs(await discover(stub));

    expect(discovered).toHaveLength(101);
    expect(new Set(discovered).size).toBe(101);
    expect(discovered.filter((slug) => slug === 'octo/r100')).toEqual(['octo/r100']);
  });

  it('stops with a classified outcome and no further pages when a page fails', async () => {
    const stub = createFetchStub([
      {
        method: 'GET',
        pathPattern: /^\/user\/repos/,
        respond: () => ({ status: 401, body: { message: 'Bad credentials' } }),
      },
    ]);

    const results = await discover(stub);

    expect(results).toHaveLength(1);
    const first = results[0];
    expect(first?.ok).toBe(false);
    if (first?.ok === false) expect(first.error.kind).toBe('unauthenticated');
    expect(stub.requests).toHaveLength(1);
  });

  it('refuses a bodyless 202 page instead of reporting a truncated account as success', async () => {
    const stub = createFetchStub([
      { method: 'GET', pathPattern: /^\/user\/repos/, respond: () => ({ status: 202 }) },
    ]);

    const results = await discover(stub);

    expect(results).toHaveLength(1);
    const first = results[0];
    expect(first?.ok).toBe(false);
    // A 202 is never data — not even an empty page.
    if (first?.ok === false) expect(first.error.kind).toBe('not-settled');
  });

  it('rejects provider drift on a page rather than mapping it', async () => {
    const stub = createFetchStub([
      {
        method: 'GET',
        pathPattern: /^\/user\/repos/,
        respond: () => ({ status: 200, body: { total_count: 0, items: [] } }),
      },
    ]);

    const results = await discover(stub);
    const first = results[0];
    expect(first?.ok).toBe(false);
    if (first?.ok === false) expect(first.error.kind).toBe('response-shape');
  });
});

describe('GitHubProvider filters', () => {
  const flags = [
    { field: 'includeForks', payload: { fork: true } },
    { field: 'includeArchived', payload: { archived: true } },
    { field: 'includeTemplates', payload: { is_template: true } },
    { field: 'includeDisabled', payload: { disabled: true } },
    { field: 'includePrivate', payload: { private: true, visibility: 'private' } },
  ] as const;

  for (const flag of flags) {
    it(`excludes the matching repository when ${flag.field} is false`, async () => {
      const stub = repositoryList([
        repositoryPayload({ id: 1, name: 'plain', full_name: 'octo/plain' }),
        repositoryPayload({
          id: 2,
          name: 'flagged',
          full_name: 'octo/flagged',
          ...flag.payload,
        }),
      ]);

      const kept = slugs(await discover(stub, { ...everything, [flag.field]: false }));

      expect(kept).toEqual(['octo/plain']);
      // Excluded means not collected, so no detail request may be issued for it either.
      expect(stub.countMatching(/^\/repos\//)).toBe(0);
    });
  }

  it('excludes public repositories when includePublic is false', async () => {
    const stub = repositoryList([
      repositoryPayload({ id: 1, name: 'open', full_name: 'octo/open' }),
      repositoryPayload({
        id: 2,
        name: 'closed',
        full_name: 'octo/closed',
        private: true,
        visibility: 'private',
      }),
    ]);

    expect(slugs(await discover(stub, { ...everything, includePublic: false }))).toEqual([
      'octo/closed',
    ]);
  });

  it('applies include and exclude slug globs, with exclude winning', async () => {
    const stub = repositoryList([
      repositoryPayload({ id: 1, name: 'site', full_name: 'octo/site' }),
      repositoryPayload({ id: 2, name: 'site-draft', full_name: 'octo/site-draft' }),
      repositoryPayload({ id: 3, name: 'tool', full_name: 'other/tool' }),
    ]);

    const kept = slugs(
      await discover(stub, { ...everything, includeSlugs: ['octo/*'], excludeSlugs: ['*-draft'] }),
    );

    expect(kept).toEqual(['octo/site']);
  });

  it('matches slug globs case-insensitively, as GitHub resolves them', async () => {
    const stub = repositoryList([
      repositoryPayload({
        id: 1,
        name: 'Plugins.GitHub',
        full_name: 'SubZeroDev/Plugins.GitHub',
      }),
    ]);

    expect(slugs(await discover(stub, { ...everything, includeSlugs: ['subzerodev/*'] }))).toEqual([
      'SubZeroDev/Plugins.GitHub',
    ]);
  });

  it('treats a dot in a glob as a literal, not as any character', async () => {
    const stub = repositoryList([
      repositoryPayload({ id: 1, name: 'a.b', full_name: 'octo/a.b' }),
      repositoryPayload({ id: 2, name: 'axb', full_name: 'octo/axb' }),
    ]);

    expect(slugs(await discover(stub, { ...everything, includeSlugs: ['octo/a.b'] }))).toEqual([
      'octo/a.b',
    ]);
  });
});

describe('GitHubProvider collection', () => {
  it('states what it did not collect rather than reporting a silent success', async () => {
    const stub = repositoryPages(1);
    const [discovered] = await discover(stub);
    if (discovered?.ok !== true) throw new Error('expected a discovered repository');

    const result = await provider(stub.fetch).collect(discovered.value, 'standard', {
      etags: { 'repository:1': '"abc"' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.repository).toEqual(discovered.value.repository);
      expect(result.value.diagnostics).toHaveLength(2);
      expect(result.value.diagnostics[0]).toContain('collection_not_implemented');
      expect(result.value.diagnostics[1]).toContain('conditional_requests_not_implemented');
    }
  });
});

describe('GitHubProvider usage', () => {
  it('reports one primary request per page and nothing else', async () => {
    const stub = repositoryPages(101);
    const client = provider(stub.fetch);
    const results: Outcome<DiscoveredRepository, ProviderError>[] = [];
    for await (const result of client.discover(everything)) results.push(result);

    expect(results).toHaveLength(101);
    expect(client.usage()).toEqual({
      primaryRequests: 2,
      searchRequests: 0,
      notModifiedResponses: 0,
      retries: 0,
    });
  });
});
