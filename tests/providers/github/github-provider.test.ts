import { describe, expect, it } from 'vitest';

import type { ResolvedToken } from '../../../src/configuration/environment.js';
import type { Logger } from '../../../src/logging/logger.js';
import { GitHubProvider } from '../../../src/providers/github/github-provider.js';
import { budgetForProfile } from '../../../src/providers/github/endpoints.js';
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
  it('uses discovery metadata without extra requests for the basic profile', async () => {
    const stub = repositoryPages(1);
    const client = provider(stub.fetch);
    const discoveredResults: Outcome<DiscoveredRepository, ProviderError>[] = [];
    for await (const result of client.discover(everything)) discoveredResults.push(result);
    const [discovered] = discoveredResults;
    if (discovered?.ok !== true) throw new Error('expected a discovered repository');

    const result = await client.collect(discovered.value, 'basic', { etags: {} });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.statistics).toMatchObject({
        sizeKilobytes: 12,
        stars: 3,
        forks: 2,
        watchers: 4,
      });
      expect(result.value.diagnostics).toEqual([]);
    }
    expect(client.usage().primaryRequests).toBe(1);
  });

  it('collects the complete standard profile within its declared budget', async () => {
    const stub = collectionStub();
    const client = provider(stub.fetch);
    const discoveredResults: Outcome<DiscoveredRepository, ProviderError>[] = [];
    for await (const result of client.discover(everything)) discoveredResults.push(result);
    const [discovered] = discoveredResults;
    if (discovered?.ok !== true) throw new Error('expected a discovered repository');

    const result = await client.collect(discovered.value, 'standard', {
      etags: { 'repository-languages:1': '"languages-etag"' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.technology.languages).toEqual([
        { name: 'TypeScript', bytes: 2, percentage: 66.67 },
        { name: 'Rust', bytes: 1, percentage: 33.33 },
      ]);
      expect(result.value.releases.total).toBe(2);
      expect(result.value.branches).toEqual({
        total: 1,
        branches: [{ name: 'main', isDefault: true, protected: true, lastCommitSha: 'abc123' }],
      });
      expect(result.value.tags).toEqual({ total: 5, latest: 'v2.0.0' });
      expect(result.value.diagnostics).toEqual([]);
    }
    expect(
      stub.requests.find((request) => request.url.pathname.endsWith('/languages'))?.headers,
    ).toMatchObject({ 'if-none-match': '"languages-etag"' });
    expect(client.usage()).toMatchObject({ primaryRequests: 6, searchRequests: 0 });
    expect(client.rawResponses()).toHaveLength(6);
    expect(JSON.stringify(client.rawResponses())).not.toContain(token.value);
  });

  it('reuses normalized cached values on 304 responses at strictly lower core cost', async () => {
    const stub = conditionalCollectionStub();
    const client = provider(stub.fetch);
    const discoveredResults: Outcome<DiscoveredRepository, ProviderError>[] = [];
    for await (const result of client.discover(everything)) discoveredResults.push(result);
    const [discovered] = discoveredResults;
    if (discovered?.ok !== true) throw new Error('expected a discovered repository');

    const first = await client.collect(discovered.value, 'standard', { etags: {} });
    if (!first.ok) throw new Error('expected the first collection to succeed');
    const firstCost = client.usage().primaryRequests;
    const etags = Object.fromEntries(
      first.value.resources.flatMap((resource) =>
        resource.etag === null ? [] : [[resource.key, resource.etag]],
      ),
    );
    const second = await client.collect(discovered.value, 'standard', {
      etags,
      previous: first.value,
    });
    if (!second.ok) throw new Error('expected the second collection to succeed');
    const secondCost = client.usage().primaryRequests - firstCost;

    expect(second.value.technology).toEqual(first.value.technology);
    expect(second.value.branches).toEqual(first.value.branches);
    expect(second.value.tags).toEqual(first.value.tags);
    expect(second.value.releases).toEqual(first.value.releases);
    expect(second.value.diagnostics).toEqual([]);
    expect(secondCost).toBeLessThan(firstCost);
    expect(client.usage().notModifiedResponses).toBe(4);
    expect(
      stub.requests.filter((request) => request.headers['if-none-match'] !== undefined),
    ).toHaveLength(4);
  });
  it('collects detailed counts, marks the contributor cap, and matches the worst-case budget', async () => {
    const stub = collectionStub(true);
    const client = provider(stub.fetch);
    const discoveredResults: Outcome<DiscoveredRepository, ProviderError>[] = [];
    for await (const result of client.discover(everything)) discoveredResults.push(result);
    const [discovered] = discoveredResults;
    if (discovered?.ok !== true) throw new Error('expected a discovered repository');

    const result = await client.collect(discovered.value, 'detailed', { etags: {} });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.contributors).toMatchObject({ total: 500, truncated: true });
      expect(result.value.branches.total).toBe(2_500);
      expect(result.value.statistics).toMatchObject({
        commits: 37,
        issues: { open: 3, closed: 7 },
        pullRequests: { open: 2, closed: 4 },
      });
      expect(result.value.diagnostics).toEqual([]);
    }
    const usage = client.usage();
    expect({ core: usage.primaryRequests - 1, search: usage.searchRequests }).toEqual(
      budgetForProfile('detailed'),
    );
  });

  it('does not mark exactly five terminal contributor pages as truncated', async () => {
    const stub = collectionStub(false, false, 5);
    const client = provider(stub.fetch);
    const discoveredResults: Outcome<DiscoveredRepository, ProviderError>[] = [];
    for await (const result of client.discover(everything)) discoveredResults.push(result);
    const [discovered] = discoveredResults;
    if (discovered?.ok !== true) throw new Error('expected a discovered repository');

    const result = await client.collect(discovered.value, 'detailed', { etags: {} });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.contributors).toMatchObject({ total: 500, truncated: false });
    }
  });
  it('keeps an empty commit count null and attaches a diagnostic', async () => {
    const stub = collectionStub(false, true);
    const client = provider(stub.fetch);
    const discoveredResults: Outcome<DiscoveredRepository, ProviderError>[] = [];
    for await (const result of client.discover(everything)) discoveredResults.push(result);
    const [discovered] = discoveredResults;
    if (discovered?.ok !== true) throw new Error('expected a discovered repository');

    const result = await client.collect(discovered.value, 'detailed', { etags: {} });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.statistics.commits).toBeNull();
      expect(result.value.diagnostics).toContainEqual(
        expect.objectContaining({ code: 'github_commits_empty' }),
      );
    }
  });
});

function collectionStub(
  fullBranchBudget = false,
  emptyCommits = false,
  contributorLastPage = 6,
): FetchStub {
  return createFetchStub([
    {
      method: 'GET',
      pathPattern: /^\/user\/repos\?/,
      respond: () => ({
        status: 200,
        body: [repositoryPayload({ id: 1, name: 'one', full_name: 'octo/one' })],
      }),
    },
    {
      method: 'GET',
      pathPattern: /^\/repos\/octo\/one\/languages$/,
      respond: () => ({ status: 200, body: { Rust: 1, TypeScript: 2 } }),
    },
    {
      method: 'GET',
      pathPattern: /^\/repos\/octo\/one\/releases\?/,
      respond: () => ({
        status: 200,
        headers: {
          link: '<https://example.test/repos/octo/one/releases?per_page=1&page=2>; rel="last"',
        },
        body: [
          {
            tag_name: 'v2.0.0',
            name: 'Second',
            published_at: '2026-01-01T00:00:00Z',
            draft: false,
            prerelease: false,
            html_url: 'https://github.com/octo/one/releases/tag/v2.0.0',
            assets: [],
          },
        ],
      }),
    },
    {
      method: 'GET',
      pathPattern: /^\/repos\/octo\/one\/releases\/latest$/,
      respond: () => ({
        status: 200,
        body: {
          tag_name: 'v2.0.0',
          name: 'Second',
          published_at: '2026-01-01T00:00:00Z',
          draft: false,
          prerelease: false,
          html_url: 'https://github.com/octo/one/releases/tag/v2.0.0',
          assets: [],
        },
      }),
    },
    {
      method: 'GET',
      pathPattern: /^\/repos\/octo\/one\/branches\?/,
      respond: (_request, callIndex) => ({
        status: 200,
        ...(fullBranchBudget
          ? {
              headers: {
                link: '<https://example.test/repos/octo/one/branches?per_page=100&page=25>; rel="last"',
              },
            }
          : {}),
        body: fullBranchBudget
          ? Array.from({ length: 100 }, (_, index) => ({
              name: `branch-${String(callIndex * 100 + index)}`,
              protected: false,
              commit: { sha: `sha-${String(callIndex * 100 + index)}` },
            }))
          : [{ name: 'main', protected: true, commit: { sha: 'abc123' } }],
      }),
    },
    {
      method: 'GET',
      pathPattern: /^\/repos\/octo\/one\/tags\?/,
      respond: () => ({
        status: 200,
        headers: {
          link: '<https://example.test/repos/octo/one/tags?per_page=1&page=5>; rel="last"',
        },
        body: [{ name: 'v2.0.0' }],
      }),
    },
    {
      method: 'GET',
      pathPattern: /^\/repos\/octo\/one\/contributors\?/,
      respond: (_request, callIndex) => ({
        status: 200,
        headers: {
          link: `<https://example.test/repos/octo/one/contributors?per_page=100&page=${String(contributorLastPage)}>; rel="last"`,
        },
        body: Array.from({ length: 100 }, (_, index) => ({
          login: `user-${String(callIndex * 100 + index)}`,
          contributions: 1,
          html_url: `https://github.com/user-${String(callIndex * 100 + index)}`,
          type: 'User',
        })),
      }),
    },
    {
      method: 'GET',
      pathPattern: /^\/repos\/octo\/one\/commits\?/,
      respond: () => ({
        status: 200,
        ...(emptyCommits
          ? {}
          : {
              headers: {
                link: '<https://example.test/repos/octo/one/commits?per_page=1&page=37>; rel="last"',
              },
            }),
        body: emptyCommits ? [] : [{}],
      }),
    },
    {
      method: 'GET',
      pathPattern: /^\/search\/issues\?/,
      respond: (request) => {
        const query = request.url.searchParams.get('q') ?? '';
        const total = query.includes('is:pr is:open')
          ? 2
          : query.includes('is:pr is:closed')
            ? 4
            : 7;
        return { status: 200, body: { total_count: total, incomplete_results: false, items: [] } };
      },
    },
  ]);
}

function conditionalCollectionStub(): FetchStub {
  const conditional = (body: unknown, etag: string) => (_request: unknown, callIndex: number) =>
    callIndex === 0 ? { status: 200, headers: { etag }, body } : { status: 304, headers: { etag } };
  return createFetchStub([
    {
      method: 'GET',
      pathPattern: /^\/user\/repos\?/,
      respond: () => ({
        status: 200,
        body: [repositoryPayload({ id: 1, name: 'one', full_name: 'octo/one' })],
      }),
    },
    {
      method: 'GET',
      pathPattern: /^\/repos\/octo\/one\/languages$/,
      respond: conditional({ TypeScript: 2 }, '"languages-v1"'),
    },
    {
      method: 'GET',
      pathPattern: /^\/repos\/octo\/one\/releases\?/,
      respond: conditional([], '"releases-v1"'),
    },
    {
      method: 'GET',
      pathPattern: /^\/repos\/octo\/one\/branches\?/,
      respond: conditional(
        [{ name: 'main', protected: true, commit: { sha: 'abc123' } }],
        '"branches-v1"',
      ),
    },
    {
      method: 'GET',
      pathPattern: /^\/repos\/octo\/one\/tags\?/,
      respond: conditional([], '"tags-v1"'),
    },
  ]);
}
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
