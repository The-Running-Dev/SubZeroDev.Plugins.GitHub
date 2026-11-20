import { describe, expect, it } from 'vitest';

import type { ResolvedToken } from '../../../src/configuration/environment.js';
import type { Logger } from '../../../src/logging/logger.js';
import { GitHubProvider } from '../../../src/providers/github/github-provider.js';
import type { Outcome, ProviderError } from '../../../src/providers/outcome.js';
import type { DiscoveredRepository, RepositoryFilter } from '../../../src/providers/provider.js';
import { fakeClock, fakeSleeper } from '../../support/fake-ports.js';
import { createFetchStub, type FetchStub, type StubRoute } from '../../support/fetch-stub.js';
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

async function discover(
  stub: FetchStub,
  filter: RepositoryFilter,
): Promise<Outcome<DiscoveredRepository, ProviderError>[]> {
  const provider = new GitHubProvider({
    token,
    logger,
    sleeper: fakeSleeper(),
    clock: fakeClock(),
    budget: { warnAtPercentConsumed: 50, stopAtPercentConsumed: 90 },
    userAgent: 'test-agent',
    fetch: stub.fetch,
    baseUrl: 'https://example.test',
    retainRawResponses: false,
  });
  const results: Outcome<DiscoveredRepository, ProviderError>[] = [];
  for await (const result of provider.discover(filter)) results.push(result);
  return results;
}

const slugs = (results: readonly Outcome<DiscoveredRepository, ProviderError>[]): string[] =>
  results.flatMap((result) => (result.ok ? [result.value.repository.slug] : []));

function repositories(owner: string, firstId: number, count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) =>
    repositoryPayload({
      id: firstId + index,
      name: `${owner}-${String(index + 1)}`,
      full_name: `${owner}/${owner}-${String(index + 1)}`,
      owner: { login: owner, id: firstId },
    }),
  );
}

/** Serves a listing paged exactly as the request asks. */
function paged(all: readonly Record<string, unknown>[]): StubRoute['respond'] {
  return (request) => {
    const page = Number(request.url.searchParams.get('page') ?? '1');
    const perPage = Number(request.url.searchParams.get('per_page') ?? '100');
    return { status: 200, body: all.slice((page - 1) * perPage, page * perPage) };
  };
}

const ownedRoute = (all: readonly Record<string, unknown>[]): StubRoute => ({
  method: 'GET',
  pathPattern: /^\/user\/repos\?/,
  respond: paged(all),
});

const organizationRoute = (login: string, respond: StubRoute['respond']): StubRoute => ({
  method: 'GET',
  pathPattern: new RegExp(`^/orgs/${login}/repos\\?`),
  respond,
});

describe('GitHubProvider organization discovery', () => {
  it('lists owned repositories, then each configured organization, paging every listing', async () => {
    const stub = createFetchStub([
      ownedRoute(repositories('octo', 1, 3)),
      organizationRoute('AbsoluteZeroDev', paged(repositories('AbsoluteZeroDev', 1000, 150))),
    ]);

    const discovered = slugs(
      await discover(stub, { ...everything, organizations: ['AbsoluteZeroDev'] }),
    );

    expect(discovered).toHaveLength(153);
    expect(new Set(discovered).size).toBe(153);
    expect(discovered.slice(0, 3)).toEqual(['octo/octo-1', 'octo/octo-2', 'octo/octo-3']);
    const organizationRequests = stub.requests.filter((request) =>
      request.url.pathname.startsWith('/orgs/'),
    );
    expect(organizationRequests.map((request) => request.url.searchParams.get('page'))).toEqual([
      '1',
      '2',
    ]);
    expect(organizationRequests[0]?.url.searchParams.get('type')).toBe('all');
    expect(organizationRequests[0]?.url.searchParams.get('per_page')).toBe('100');
    stub.assertNoUnmatchedRoutes();
  });

  it('makes no organization request when none is configured', async () => {
    const stub = createFetchStub([ownedRoute(repositories('octo', 1, 2))]);

    expect(slugs(await discover(stub, everything))).toHaveLength(2);
    expect(stub.requests.every((request) => request.url.pathname === '/user/repos')).toBe(true);
  });

  it('yields a repository once when owned and organization listings overlap', async () => {
    const shared = repositoryPayload({ id: 7, name: 'shared', full_name: 'octo/shared' });
    const stub = createFetchStub([
      ownedRoute([shared]),
      organizationRoute('first', () => ({
        status: 200,
        body: [
          // The same identity under a new slug: transferred while the walk ran.
          { ...shared, full_name: 'first/shared', owner: { login: 'first', id: 50 } },
          repositoryPayload({ id: 8, name: 'tool', full_name: 'first/tool' }),
        ],
      })),
      organizationRoute('second', () => ({
        status: 200,
        body: [repositoryPayload({ id: 8, name: 'tool', full_name: 'second/tool' })],
      })),
    ]);

    const results = await discover(stub, { ...everything, organizations: ['first', 'second'] });

    expect(results.every((result) => result.ok)).toBe(true);
    expect(slugs(results)).toEqual(['octo/shared', 'first/tool']);
  });

  it('keeps private organization repositories and honors includePrivate for them', async () => {
    const body = [
      repositoryPayload({ id: 20, name: 'open', full_name: 'org/open', private: false }),
      repositoryPayload({
        id: 21,
        name: 'secret',
        full_name: 'org/secret',
        private: true,
        visibility: 'private',
      }),
    ];
    const routes = (): FetchStub =>
      createFetchStub([ownedRoute([]), organizationRoute('org', () => ({ status: 200, body }))]);

    expect(slugs(await discover(routes(), { ...everything, organizations: ['org'] }))).toEqual([
      'org/open',
      'org/secret',
    ]);
    expect(
      slugs(
        await discover(routes(), { ...everything, organizations: ['org'], includePrivate: false }),
      ),
    ).toEqual(['org/open']);
  });

  it('applies fork, archived, and slug filters to organization repositories', async () => {
    const stub = createFetchStub([
      ownedRoute([]),
      organizationRoute('org', () => ({
        status: 200,
        body: [
          repositoryPayload({ id: 30, name: 'kept', full_name: 'org/kept' }),
          repositoryPayload({ id: 31, name: 'fork', full_name: 'org/fork', fork: true }),
          repositoryPayload({ id: 32, name: 'old', full_name: 'org/old', archived: true }),
          repositoryPayload({ id: 33, name: 'skip', full_name: 'org/skip' }),
        ],
      })),
    ]);

    const discovered = slugs(
      await discover(stub, {
        ...everything,
        includeForks: false,
        includeArchived: false,
        excludeSlugs: ['ORG/skip'],
        organizations: ['org'],
      }),
    );

    expect(discovered).toEqual(['org/kept']);
  });

  for (const denial of [
    { status: 404, kind: 'not-found', code: 'github_organization_not_found' },
    { status: 403, kind: 'forbidden', code: 'github_organization_forbidden' },
  ] as const) {
    it(`reports HTTP ${String(denial.status)} as ${denial.code} after the owned repositories`, async () => {
      const stub = createFetchStub([
        ownedRoute(repositories('octo', 1, 2)),
        organizationRoute('missing', () => ({
          status: denial.status,
          body: {
            message:
              denial.status === 404
                ? 'Not Found'
                : 'Resource protected by organization SAML enforcement.',
          },
        })),
        organizationRoute('later', () => ({ status: 200, body: [] })),
      ]);

      const results = await discover(stub, {
        ...everything,
        organizations: ['missing', 'later'],
      });

      expect(slugs(results)).toEqual(['octo/octo-1', 'octo/octo-2']);
      const last = results.at(-1);
      expect(last?.ok).toBe(false);
      if (last?.ok === false) {
        expect(last.error).toMatchObject({
          kind: denial.kind,
          code: denial.code,
          status: denial.status,
          subject: 'organization:missing',
          retryable: false,
        });
        expect(last.error.message).not.toContain('token-canary-value');
      }
      // The run stops at the first incomplete listing.
      expect(stub.requests.some((request) => request.url.pathname === '/orgs/later/repos')).toBe(
        false,
      );
    });
  }

  it('fails an organization listing partway through rather than truncating it', async () => {
    const all = repositories('org', 500, 100);
    const stub = createFetchStub([
      ownedRoute([]),
      organizationRoute('org', (request) =>
        request.url.searchParams.get('page') === '1'
          ? { status: 200, body: all }
          : { status: 502, body: { message: 'Bad Gateway' } },
      ),
    ]);

    const results = await discover(stub, { ...everything, organizations: ['org'] });

    expect(slugs(results)).toHaveLength(100);
    const last = results.at(-1);
    expect(last?.ok).toBe(false);
    if (last?.ok === false) {
      expect(last.error.kind).toBe('server-error');
      expect(last.error.subject).toBe('organization:org');
    }
  });

  it('never lists organizations in selected scope', async () => {
    const stub = createFetchStub([
      {
        method: 'GET',
        pathPattern: /^\/repos\/octo\/app$/,
        respond: () => ({
          status: 200,
          body: repositoryPayload({ id: 1, name: 'app', full_name: 'octo/app' }),
        }),
      },
    ]);

    const results = await discover(stub, {
      ...everything,
      scope: 'selected',
      includeSlugs: ['octo/app'],
      organizations: ['org'],
    });

    expect(slugs(results)).toEqual(['octo/app']);
    expect(stub.requests).toHaveLength(1);
  });
});
