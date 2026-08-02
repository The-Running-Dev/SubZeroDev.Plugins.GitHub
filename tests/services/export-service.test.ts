import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RepositoryCache } from '../../src/cache/store.js';
import type { CachedProject } from '../../src/cache/reconcile.js';
import {
  ExportError,
  exportCachedProjects,
  previewCachedProjects,
} from '../../src/services/export-service.js';
import type { FileSystemPort } from '../../src/services/ports.js';
import { memoryFileSystem } from '../support/fake-ports.js';
import { projectFixture } from '../support/project-fixture.js';

const owner = { provider: 'github', providerId: '99', login: 'fixture' };

describe('export service', () => {
  it('stages and publishes all documents with verified artifact metadata', async () => {
    const fileSystem = memoryFileSystem();
    const cache = new RepositoryCache(fileSystem, 'cache', () => 'cache-run');
    await seed(cache, [cached('2'), cached('1')]);

    const result = await exportCachedProjects({
      cache,
      fileSystem,
      outputDirectory: 'output',
      formats: ['json', 'yaml'],
      runId: () => 'export-run',
    });

    expect(result.artifacts.map(({ path }) => path)).toEqual([
      'projects.json',
      'projects.yaml',
      'projects.schema.json',
      'statistics.json',
      'summary.json',
      'sync-report.json',
    ]);
    expect(fileSystem.renames.slice(-6).map(({ to }) => to.replaceAll('\\', '/'))).toEqual(
      result.artifacts.map(({ path }) => `${normalize(resolve('output'))}/${path}`),
    );
    for (const artifact of result.artifacts) {
      expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(artifact.bytes).toBeGreaterThan(0);
    }
  });

  it('leaves the previous output set unchanged when staging document five fails', async () => {
    const fileSystem = memoryFileSystem();
    let failStaging = false;
    let staged = 0;
    const failingFileSystem: FileSystemPort = {
      ...fileSystem,
      writeFile: async (path, contents) => {
        if (failStaging && path.includes('.staging-export-fail')) {
          staged += 1;
          if (staged === 5) throw new Error('injected stage failure');
        }
        await fileSystem.writeFile(path, contents);
      },
    };
    const cache = new RepositoryCache(failingFileSystem, 'cache', () => 'cache-run');
    await seed(cache, [cached('1')]);
    await exportCachedProjects({
      cache,
      fileSystem: failingFileSystem,
      outputDirectory: 'output',
      formats: ['json', 'yaml'],
      runId: () => 'export-ok',
    });
    const paths = [
      'projects.json',
      'projects.yaml',
      'projects.schema.json',
      'statistics.json',
      'summary.json',
      'sync-report.json',
    ];
    const before = paths.map((path) => fileSystem.read(resolve('output', path)));
    await seed(cache, [cached('1', 100)]);
    failStaging = true;

    await expect(
      exportCachedProjects({
        cache,
        fileSystem: failingFileSystem,
        outputDirectory: 'output',
        formats: ['json', 'yaml'],
        runId: () => 'export-fail',
      }),
    ).rejects.toBeInstanceOf(ExportError);
    expect(paths.map((path) => fileSystem.read(resolve('output', path)))).toEqual(before);
  });

  it('requires a valid synchronized cache', async () => {
    await expect(
      exportCachedProjects({
        cache: new RepositoryCache(memoryFileSystem(), 'cache'),
        fileSystem: memoryFileSystem(),
        outputDirectory: 'output',
        formats: ['json'],
      }),
    ).rejects.toThrow(/run sync first/);
  });

  it('previews every artifact without filesystem writes', async () => {
    const fileSystem = memoryFileSystem();
    const cache = new RepositoryCache(fileSystem, 'cache', () => 'cache-run');
    await seed(cache, [cached('1')]);
    const writesBefore = fileSystem.writes.length;
    const renamesBefore = fileSystem.renames.length;

    const result = await previewCachedProjects({
      cache,
      formats: ['json', 'yaml'],
    });

    expect(result.artifacts).toHaveLength(6);
    expect(fileSystem.writes).toHaveLength(writesBefore);
    expect(fileSystem.renames).toHaveLength(renamesBefore);
  });
});

async function seed(cache: RepositoryCache, projects: readonly CachedProject[]): Promise<void> {
  await cache.write({ owner, synchronizedAt: '2026-08-01T00:00:00Z', projects });
}

function cached(id: string, stars = 0): CachedProject {
  return {
    project: projectFixture({ id, stars }),
    resources: [],
    diagnostics: [],
    partial: false,
  };
}

const normalize = (path: string): string => path.replaceAll('\\', '/');
