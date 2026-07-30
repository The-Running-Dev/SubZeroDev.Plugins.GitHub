import { describe, expect, it } from 'vitest';

import { CacheError, RepositoryCache } from '../../src/cache/store.js';
import { listCachedRepositories } from '../../src/services/list-service.js';
import {
  githubRepositorySchema,
  mapRepository,
} from '../../src/providers/github/mapping/repository.js';
import { memoryFileSystem } from '../support/fake-ports.js';
import { repositoryPayload } from '../support/github-payloads.js';

const repository = (id: number, name: string) =>
  mapRepository(
    githubRepositorySchema.parse(repositoryPayload({ id, name, full_name: `octo/${name}` })),
  );

describe('minimal repository cache', () => {
  it('writes canonical per-repository documents before publishing the manifest', async () => {
    const fileSystem = memoryFileSystem();
    const cache = new RepositoryCache(fileSystem, 'cache');

    await cache.write([repository(10, 'ten'), repository(2, 'two')], '2026-07-30T00:00:00Z');

    expect(fileSystem.renames.map((entry) => entry.to)).toEqual([
      'cache/repositories/2.json',
      'cache/repositories/10.json',
      'cache/manifest.json',
    ]);
    await expect(cache.read()).resolves.toMatchObject({
      synchronizedAt: '2026-07-30T00:00:00Z',
      repositories: [{ identity: { providerId: '2' } }, { identity: { providerId: '10' } }],
    });
  });

  it('returns null before the first successful synchronization', async () => {
    await expect(new RepositoryCache(memoryFileSystem(), 'cache').read()).resolves.toBeNull();
  });

  it('refuses a malformed cache instead of treating it as empty', async () => {
    const fileSystem = memoryFileSystem({ 'cache/manifest.json': '{ not json' });
    await expect(new RepositoryCache(fileSystem, 'cache').read()).rejects.toBeInstanceOf(
      CacheError,
    );
  });

  it('reports a manifest entry with a missing repository document as an invalid cache', async () => {
    const fileSystem = memoryFileSystem();
    const cache = new RepositoryCache(fileSystem, 'cache');
    await cache.write([repository(2, 'two')], '2026-07-30T00:00:00Z');
    await fileSystem.remove('cache/repositories/2.json');

    await expect(cache.read()).rejects.toBeInstanceOf(CacheError);
    await expect(listCachedRepositories(cache)).resolves.toMatchObject({
      outcome: { kind: 'failed', exitCode: 3 },
      errors: [{ code: 'cache_invalid' }],
    });
  });
});
