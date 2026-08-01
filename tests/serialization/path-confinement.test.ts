import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { confinedPath, confinedRealPath } from '../../src/serialization/path-confinement.js';
import { nodeFileSystem } from '../../src/services/node-file-system.js';

describe('artifact path confinement', () => {
  for (const path of [
    '../etc',
    '..\\etc',
    '/etc/passwd',
    '\\\\server\\share',
    'C:\\secret',
    'safe/../../etc',
  ]) {
    it(`refuses ${JSON.stringify(path)}`, () => {
      expect(() => confinedPath('output', path)).toThrow(/escapes its root/);
    });
  }

  it('refuses an existing symlink ancestor that resolves outside the output root', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'subzerodev-export-'));
    const output = join(temporary, 'output');
    const outside = join(temporary, 'outside');
    try {
      await nodeFileSystem.mkdir(output, { recursive: true });
      await nodeFileSystem.mkdir(outside, { recursive: true });
      await symlink(
        outside,
        join(output, 'linked'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );

      await expect(
        confinedRealPath(nodeFileSystem, output, 'linked/projects.json'),
      ).rejects.toThrow(/outside its root/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
});
