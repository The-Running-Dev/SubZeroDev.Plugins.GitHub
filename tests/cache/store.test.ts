import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';

import { CacheError, CacheVersionError, RepositoryCache } from '../../src/cache/store.js';
import type { CachedProject } from '../../src/cache/reconcile.js';
import { listCachedRepositories } from '../../src/services/list-service.js';
import { canonicalJson } from '../../src/serialization/canonical-json.js';
import { memoryFileSystem } from '../support/fake-ports.js';
import type { FileSystemPort } from '../../src/services/ports.js';
import { projectFixture } from '../support/project-fixture.js';

const owner = { provider: 'github', providerId: '99', login: 'fixture' };

describe('repository cache', () => {
  it('publishes content-addressed project documents before the manifest', async () => {
    const fileSystem = memoryFileSystem();
    const cache = new RepositoryCache(fileSystem, 'cache', () => 'test-run');

    await cache.write({
      owner,
      synchronizedAt: '2026-07-30T00:00:00Z',
      projects: [cached('10'), cached('2')],
    });

    expect(fileSystem.renames.at(-1)?.to.replaceAll('\\', '/')).toMatch(/cache\/manifest\.json$/);
    await expect(cache.read()).resolves.toMatchObject({
      synchronizedAt: '2026-07-30T00:00:00Z',
      repositories: [{ identity: { providerId: '2' } }, { identity: { providerId: '10' } }],
    });
  });

  it('returns null before the first successful synchronization', async () => {
    await expect(new RepositoryCache(memoryFileSystem(), 'cache').read()).resolves.toBeNull();
  });

  it('does not remove an in-progress staging directory while reading', async () => {
    const fileSystem = memoryFileSystem();
    const cache = new RepositoryCache(fileSystem, 'cache', () => 'completed-run');
    await cache.write({
      owner,
      synchronizedAt: '2026-07-30T00:00:00Z',
      projects: [cached('1')],
    });
    const stagedPath = resolve('cache/.staging-active-run/repositories/2.json');
    fileSystem.set(stagedPath, 'publication in progress');

    await expect(listCachedRepositories(cache)).resolves.toMatchObject({
      outcome: { kind: 'succeeded' },
    });
    expect(fileSystem.has(stagedPath)).toBe(true);
  });

  it('loads repository documents with bounded concurrency', async () => {
    const fileSystem = memoryFileSystem();
    const cache = new RepositoryCache(fileSystem, 'cache', () => 'test-run');
    await cache.write({
      owner,
      synchronizedAt: '2026-07-30T00:00:00Z',
      projects: Array.from({ length: 8 }, (_, index) => cached(String(index + 1))),
    });

    let inFlight = 0;
    let maximum = 0;
    const delayedFileSystem: FileSystemPort = {
      ...fileSystem,
      readFile: async (path) => {
        if (!path.replaceAll('\\', '/').includes('/repositories/')) {
          return fileSystem.readFile(path);
        }
        inFlight += 1;
        maximum = Math.max(maximum, inFlight);
        try {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 1));
          return await fileSystem.readFile(path);
        } finally {
          inFlight -= 1;
        }
      },
    };

    const snapshot = await new RepositoryCache(delayedFileSystem, 'cache').read();
    expect(snapshot?.projects).toHaveLength(8);
    expect(maximum).toBe(4);
  });

  it('refuses malformed and incompatible manifests distinctly', async () => {
    const malformed = new RepositoryCache(
      memoryFileSystem({ [resolve('cache/manifest.json')]: '{ not json' }),
      'cache',
    );
    await expect(malformed.read()).rejects.toBeInstanceOf(CacheError);

    const incompatible = new RepositoryCache(
      memoryFileSystem({
        [resolve('cache/manifest.json')]: canonicalJson({ cacheVersion: '2.0.0' }),
      }),
      'cache',
    );
    await expect(incompatible.read()).rejects.toBeInstanceOf(CacheVersionError);
    await expect(incompatible.read()).rejects.toThrow(/2\.0\.0.*1\.0\.0/);
  });

  it('detects a missing or corrupted project document', async () => {
    const fileSystem = memoryFileSystem();
    const cache = new RepositoryCache(fileSystem, 'cache', () => 'test-run');
    await cache.write({ owner, synchronizedAt: '2026-07-30T00:00:00Z', projects: [cached('2')] });
    const projectPath = fileSystem.renames.find(({ to }) => to.includes('repositories'))?.to;
    expect(projectPath).toBeDefined();
    await fileSystem.remove(projectPath as string);
    await expect(cache.read()).rejects.toBeInstanceOf(CacheError);
    await expect(listCachedRepositories(cache)).resolves.toMatchObject({
      outcome: { kind: 'failed', exitCode: 3 },
      errors: [{ code: 'cache_invalid' }],
    });
  });

  it('keeps a bounded list payload and reports truncation', async () => {
    const cache = new RepositoryCache(memoryFileSystem(), 'cache', () => 'test-run');
    await cache.write({
      owner,
      synchronizedAt: '2026-07-30T00:00:00Z',
      projects: Array.from({ length: 101 }, (_, index) => cached(String(index + 1))),
    });

    const result = await listCachedRepositories(cache);
    expect(result.data?.totalRepositories).toBe(101);
    expect(result.data?.repositories).toHaveLength(100);
    expect(result.warnings).toMatchObject([{ code: 'list_truncated' }]);
  });

  it('reuses an existing content-addressed document on an unchanged write', async () => {
    const fileSystem = memoryFileSystem();
    const cache = new RepositoryCache(fileSystem, 'cache', () => 'test-run');
    const project = cached('1');
    await cache.write({ owner, synchronizedAt: '2026-07-30T00:00:00Z', projects: [project] });
    const firstProjectWrites = fileSystem.writes.filter((path) =>
      path.includes('repositories'),
    ).length;
    await cache.write({ owner, synchronizedAt: '2026-07-31T00:00:00Z', projects: [project] });

    expect(fileSystem.writes.filter((path) => path.includes('repositories'))).toHaveLength(
      firstProjectWrites,
    );
  });

  it('keeps the last valid snapshot when publication is interrupted', async () => {
    const fileSystem = memoryFileSystem();
    let failPublication = false;
    let publicationRenames = 0;
    const failingFileSystem: FileSystemPort = {
      ...fileSystem,
      rename: async (from, to) => {
        if (failPublication) {
          publicationRenames += 1;
          if (publicationRenames === 2) throw new Error('injected rename failure');
        }
        await fileSystem.rename(from, to);
      },
    };
    const cache = new RepositoryCache(failingFileSystem, 'cache', () => 'run');
    await cache.write({
      owner,
      synchronizedAt: '2026-07-30T00:00:00Z',
      projects: [cached('1'), cached('2')],
    });
    const before = await cache.read();
    failPublication = true;

    await expect(
      cache.write({
        owner,
        synchronizedAt: '2026-07-31T00:00:00Z',
        projects: [
          { ...cached('1'), project: projectFixture({ id: '1', stars: 100 }) },
          { ...cached('2'), project: projectFixture({ id: '2', stars: 200 }) },
        ],
      }),
    ).rejects.toThrow('injected rename failure');

    await expect(cache.read()).resolves.toEqual(before);
  });

  it('reclaims project documents no longer referenced by the committed manifest', async () => {
    const fileSystem = memoryFileSystem();
    const cache = new RepositoryCache(fileSystem, 'cache', () => 'run');
    await cache.write({
      owner,
      synchronizedAt: '2026-07-30T00:00:00Z',
      projects: [cached('1'), cached('2')],
    });
    const removedDocument = fileSystem.renames.find(({ to }) => to.includes('repositories/2-'))?.to;
    expect(removedDocument).toBeDefined();

    await cache.write({
      owner,
      synchronizedAt: '2026-07-31T00:00:00Z',
      projects: [cached('1')],
    });

    expect(fileSystem.has(removedDocument as string)).toBe(false);
  });
});

function cached(id: string): CachedProject {
  return { project: projectFixture({ id }), resources: [], diagnostics: [], partial: false };
}
