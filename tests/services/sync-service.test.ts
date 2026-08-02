import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';

import { RepositoryCache } from '../../src/cache/store.js';
import type { Project } from '../../src/models/project.js';
import type {
  CollectionProfile,
  CollectionResult,
  DiscoveredRepository,
  RepositoryFilter,
  RepositoryProvider,
  RequestUsage,
  ResourceConditions,
} from '../../src/providers/provider.js';
import type { Outcome, ProviderError } from '../../src/providers/outcome.js';
import { synchronizeRepositories } from '../../src/services/sync-service.js';
import { canonicalJson } from '../../src/serialization/canonical-json.js';
import { memoryFileSystem } from '../support/fake-ports.js';
import { projectFixture } from '../support/project-fixture.js';

const filter: RepositoryFilter = {
  includeForks: false,
  includeArchived: true,
  includeTemplates: true,
  includeDisabled: true,
  includePrivate: true,
  includePublic: true,
  includeSlugs: [],
  excludeSlugs: [],
};

describe('incremental synchronization', () => {
  it('collects complete projects and records additions', async () => {
    const cache = new RepositoryCache(memoryFileSystem(), 'cache', () => 'run');
    const result = await sync(
      cache,
      new FakeProvider([projectFixture({ id: '1' })]),
      '2026-08-01T00:00:00Z',
    );

    expect(result).toMatchObject({
      outcome: { kind: 'succeeded' },
      data: { cachedRepositories: 1, changes: { added: 1 } },
    });
    await expect(cache.read()).resolves.toMatchObject({
      projects: [{ project: { schemaVersion: '1.0.0' } }],
    });
  });

  it('computes a complete dry run without filesystem writes', async () => {
    const fileSystem = memoryFileSystem();
    const cache = new RepositoryCache(fileSystem, 'cache', () => 'run');
    const result = await synchronizeRepositories({
      provider: new FakeProvider([projectFixture({ id: '1' })]),
      cache,
      filter,
      profile: 'standard',
      concurrency: 2,
      synchronizedAt: '2026-08-01T00:00:00Z',
      dryRun: true,
    });

    expect(result).toMatchObject({
      outcome: { kind: 'succeeded' },
      data: { dryRun: true, cacheWritePerformed: false, changes: { added: 1 } },
    });
    expect(fileSystem.writes).toEqual([]);
    expect(fileSystem.renames).toEqual([]);
  });

  it('retains failed repositories byte-for-byte and exits partial', async () => {
    const cache = new RepositoryCache(memoryFileSystem(), 'cache', () => 'run');
    await sync(
      cache,
      new FakeProvider([
        projectFixture({ id: '1', stars: 1 }),
        projectFixture({ id: '2', stars: 2 }),
      ]),
      '2026-08-01T00:00:00Z',
    );
    const before = await cache.read();
    const retainedBefore = before?.projects.find(
      ({ project }) => project.repository.identity.providerId === '2',
    );

    const provider = new FakeProvider(
      [projectFixture({ id: '1', stars: 3 }), projectFixture({ id: '2', stars: 4 })],
      new Set(['2']),
    );
    const result = await sync(cache, provider, '2026-08-02T00:00:00Z');
    const after = await cache.read();
    const retainedAfter = after?.projects.find(
      ({ project }) => project.repository.identity.providerId === '2',
    );

    expect(result).toMatchObject({
      outcome: { kind: 'partial' },
      data: { changes: { updated: 1, failed: 1 } },
      errors: [{ code: 'fixture_collection_failed' }],
    });
    expect(canonicalJson(retainedAfter?.project)).toBe(canonicalJson(retainedBefore?.project));
    expect(retainedAfter).toMatchObject({
      partial: true,
      diagnostics: [{ code: 'fixture_collection_failed', retryable: true }],
    });
    expect(after?.synchronizedAt).toBe('2026-08-01T00:00:00Z');
  });

  it('updates eight of ten repositories while retaining and naming two failures', async () => {
    const cache = new RepositoryCache(memoryFileSystem(), 'cache', () => 'run');
    const first = Array.from({ length: 10 }, (_, index) =>
      projectFixture({ id: String(index + 1), stars: 1 }),
    );
    await sync(cache, new FakeProvider(first), '2026-08-01T00:00:00Z');
    const second = Array.from({ length: 10 }, (_, index) =>
      projectFixture({ id: String(index + 1), stars: 2 }),
    );

    const result = await sync(
      cache,
      new FakeProvider(second, new Set(['3', '8'])),
      '2026-08-02T00:00:00Z',
    );

    expect(result).toMatchObject({
      outcome: { kind: 'partial' },
      data: { cachedRepositories: 10, changes: { updated: 8, failed: 2 } },
    });
    expect(result.errors).toHaveLength(2);
    expect(result.errors?.map((error) => error.subject)).toEqual(['repository:3', 'repository:8']);
    const cached = await cache.read();
    expect(cached?.projects.filter(({ partial }) => partial)).toHaveLength(2);
  });

  it('reports a rename once rather than as removal plus addition', async () => {
    const cache = new RepositoryCache(memoryFileSystem(), 'cache', () => 'run');
    await sync(cache, new FakeProvider([projectFixture({ id: '42' })]), '2026-08-01T00:00:00Z');
    const renamed = projectFixture({ id: '42' });
    renamed.repository.owner = 'moved';
    renamed.repository.name = 'renamed';
    renamed.repository.slug = 'moved/renamed';

    const result = await sync(cache, new FakeProvider([renamed]), '2026-08-02T00:00:00Z');
    expect(result.data?.changes).toEqual({ renamed: 1 });
  });

  it('passes prior ETags and normalized values to the provider', async () => {
    const cache = new RepositoryCache(memoryFileSystem(), 'cache', () => 'run');
    const project = projectFixture({ id: '7' });
    await cache.write({
      owner: { provider: 'github', providerId: '99', login: 'fixture' },
      synchronizedAt: '2026-08-01T00:00:00Z',
      projects: [
        {
          project,
          resources: [
            {
              key: 'repository-languages:7',
              etag: '"languages-v1"',
              fetchedAt: '2026-08-01T00:00:00Z',
            },
          ],
          diagnostics: [],
          partial: false,
        },
      ],
    });
    const provider = new FakeProvider([project]);
    await sync(cache, provider, '2026-08-02T00:00:00Z');

    expect(provider.conditions[0]).toMatchObject({
      etags: { 'repository-languages:7': '"languages-v1"' },
      previous: { repository: { identity: { providerId: '7' } } },
    });
  });

  it('regenerates a corrupt cache with an actionable warning', async () => {
    const fileSystem = memoryFileSystem({
      [resolve('cache/manifest.json')]: '{ broken json',
    });
    const cache = new RepositoryCache(fileSystem, 'cache', () => 'run');
    const result = await sync(
      cache,
      new FakeProvider([projectFixture({ id: '1' })]),
      '2026-08-01T00:00:00Z',
    );

    expect(result).toMatchObject({
      outcome: { kind: 'succeeded' },
      warnings: [{ code: 'cache_invalid_resynchronized' }],
    });
    await expect(cache.read()).resolves.toMatchObject({
      repositories: [{ identity: { providerId: '1' } }],
    });
  });
});

async function sync(cache: RepositoryCache, provider: RepositoryProvider, synchronizedAt: string) {
  return synchronizeRepositories({
    provider,
    cache,
    filter,
    profile: 'standard',
    concurrency: 2,
    synchronizedAt,
  });
}

class FakeProvider implements RepositoryProvider {
  public readonly conditions: ResourceConditions[] = [];

  public constructor(
    private readonly projects: readonly Project[],
    private readonly failures: ReadonlySet<string> = new Set(),
  ) {}

  public checkAccess(): Promise<
    Outcome<{ login: string; ownerProviderId: string; tokenSource: 'environment' }, ProviderError>
  > {
    return Promise.resolve({
      ok: true,
      value: { login: 'fixture', ownerProviderId: '99', tokenSource: 'environment' },
    });
  }

  public async *discover(
    filter: RepositoryFilter,
  ): AsyncIterable<Outcome<DiscoveredRepository, ProviderError>> {
    void filter;
    await Promise.resolve();
    for (const project of this.projects)
      yield { ok: true, value: { repository: project.repository } };
  }

  public collect(
    target: DiscoveredRepository,
    _profile: CollectionProfile,
    conditions: ResourceConditions,
  ): Promise<Outcome<CollectionResult, ProviderError>> {
    this.conditions.push(conditions);
    const id = target.repository.identity.providerId;
    if (this.failures.has(id)) {
      return Promise.resolve({
        ok: false,
        error: {
          kind: 'server-error',
          code: 'fixture_collection_failed',
          message: `Collection failed for repository ${id}.`,
          subject: `repository:${id}`,
          retryable: true,
          status: 500,
        },
      });
    }
    const project = this.projects.find(
      (candidate) => candidate.repository.identity.providerId === id,
    );
    if (project === undefined) throw new Error(`Missing fixture project ${id}.`);
    return Promise.resolve({ ok: true, value: toCollection(project) });
  }

  public usage(): RequestUsage {
    return {
      primaryRequests: this.projects.length,
      searchRequests: 0,
      notModifiedResponses: 0,
      retries: 0,
    };
  }
}

function toCollection(project: Project): CollectionResult {
  return {
    repository: project.repository,
    technology: project.technology,
    statistics: project.statistics,
    branches: project.branches,
    tags: project.tags,
    releases: project.releases,
    contributors: project.contributors,
    diagnostics: project.diagnostics,
    resources: [],
  };
}
