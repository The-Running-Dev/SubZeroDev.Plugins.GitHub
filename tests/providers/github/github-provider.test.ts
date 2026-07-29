import { describe, expect, it } from 'vitest';

import type { ResolvedToken } from '../../../src/configuration/environment.js';
import type { Logger } from '../../../src/logging/logger.js';
import { GitHubProvider } from '../../../src/providers/github/github-provider.js';
import type { ProviderError } from '../../../src/providers/outcome.js';
import type { DiscoveredRepository } from '../../../src/providers/provider.js';
import type { Outcome } from '../../../src/providers/outcome.js';
import { fakeClock, fakeSleeper } from '../../support/fake-ports.js';
import { createFetchStub } from '../../support/fetch-stub.js';
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
  value: 'token-canary',
  source: 'environment',
  environmentVariable: 'GITHUB_TOKEN',
  credentialPath: null,
};

const filters = {
  includeForks: false,
  includeArchived: true,
  includeTemplates: true,
  includeDisabled: true,
  includePrivate: true,
  includePublic: true,
  includeSlugs: [],
  excludeSlugs: [],
};

function provider(fetch: typeof globalThis.fetch): GitHubProvider {
  return new GitHubProvider({
    token,
    logger,
    sleeper: fakeSleeper(),
    clock: fakeClock(),
    budget: { warnAtPercentConsumed: 50, stopAtPercentConsumed: 90 },
    userAgent: 'test-agent',
    fetch,
    baseUrl: 'https://example.test',
  });
}

describe('GitHubProvider discovery', () => {
  it('checks identity, pages through owned repositories, and never collects excluded forks', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      repositoryPayload({
        id: index + 1,
        name: `repository-${String(index + 1)}`,
        full_name: `octo/repository-${String(index + 1)}`,
        fork: index === 0,
      }),
    );
    const secondPage = [repositoryPayload({ id: 101, name: 'final', full_name: 'octo/final' })];
    const stub = createFetchStub([
      {
        method: 'GET',
        pathPattern: /^\/user$/,
        respond: () => ({ status: 200, body: { login: 'octo', id: 1 } }),
      },
      {
        method: 'GET',
        pathPattern: /^\/user\/repos\?/,
        respond: (request) => ({
          status: 200,
          body: request.url.searchParams.get('page') === '1' ? firstPage : secondPage,
        }),
      },
    ]);
    const client = provider(stub.fetch);

    await expect(client.checkAccess()).resolves.toMatchObject({
      ok: true,
      value: { login: 'octo', ownerProviderId: '1', tokenSource: 'environment' },
    });
    const discovered: Outcome<DiscoveredRepository, ProviderError>[] = [];
    for await (const result of client.discover(filters)) discovered.push(result);

    expect(discovered).toHaveLength(100);
    expect(discovered.every((result) => result.ok)).toBe(true);
    expect(stub.countMatching(/^\/repos\//)).toBe(0);
    expect(client.usage()).toEqual({
      primaryRequests: 3,
      searchRequests: 0,
      notModifiedResponses: 0,
      retries: 0,
    });
    stub.assertNoUnmatchedRoutes();
  });

  it('stops discovery with a classified outcome when GitHub rejects the credential', async () => {
    const stub = createFetchStub([
      {
        method: 'GET',
        pathPattern: /^\/user\/repos/,
        respond: () => ({ status: 401, body: { message: 'Bad credentials' } }),
      },
    ]);
    const results: Outcome<DiscoveredRepository, ProviderError>[] = [];
    for await (const result of provider(stub.fetch).discover(filters)) results.push(result);

    expect(results).toHaveLength(1);
    const result = results[0];
    expect(result?.ok).toBe(false);
    if (result?.ok === false) expect(result.error.kind).toBe('unauthenticated');
  });
});
