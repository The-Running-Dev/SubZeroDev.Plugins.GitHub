import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { StagingArea, reclaimStagingDirectories } from '../../src/serialization/atomic-write.js';
import { nodeFileSystem } from '../../src/services/node-file-system.js';
import { memoryFileSystem } from '../support/fake-ports.js';

describe('same-volume atomic file staging', () => {
  it('writes complete staging files before publishing them with file renames', async () => {
    const fileSystem = memoryFileSystem();
    const area = new StagingArea(fileSystem, 'cache', 'run-1');
    await area.stage('repositories/1.json', 'one');
    await area.stage('manifest.json', 'manifest');

    expect(fileSystem.writes).toEqual([
      normalize(resolve('cache/.staging-run-1/repositories/1.json')),
      normalize(resolve('cache/.staging-run-1/manifest.json')),
    ]);
    await area.commit();
    expect(fileSystem.renames.map(({ to }) => to)).toEqual([
      normalize(resolve('cache/repositories/1.json')),
      normalize(resolve('cache/manifest.json')),
    ]);
  });

  it('reclaims only abandoned staging directories', async () => {
    const fileSystem = memoryFileSystem({
      'cache/.staging-old/manifest.json': 'old',
      'cache/manifest.json': 'live',
    });

    await expect(reclaimStagingDirectories(fileSystem, 'cache')).resolves.toEqual(['.staging-old']);
    expect(fileSystem.has('cache/manifest.json')).toBe(true);
    expect(fileSystem.has('cache/.staging-old/manifest.json')).toBe(false);
  });

  it('refuses a staging directory symlink that resolves outside the live root', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'subzerodev-staging-'));
    const output = join(temporary, 'output');
    const outside = join(temporary, 'outside');
    try {
      await nodeFileSystem.mkdir(output, { recursive: true });
      await nodeFileSystem.mkdir(outside, { recursive: true });
      await symlink(
        outside,
        join(output, '.staging-known'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );

      const area = new StagingArea(nodeFileSystem, output, 'known');
      await expect(area.stage('projects.json', '{}')).rejects.toThrow(/outside its root/);
      await expect(nodeFileSystem.stat(join(outside, 'projects.json'))).resolves.toBeNull();
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
});

const normalize = (path: string): string => path.replaceAll('\\', '/');
