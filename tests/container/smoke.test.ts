import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RepositoryCache } from '../../src/cache/store.js';
import { nodeFileSystem } from '../../src/services/node-file-system.js';

describe('container release surface', () => {
  it('declares non-root identity, writable roots, labels, and the real entrypoint', () => {
    const dockerfile = readFileSync(resolve('Dockerfile'), 'utf8');
    expect(dockerfile).toContain('USER subzerodev');
    expect(dockerfile).toContain('--uid 10001');
    expect(dockerfile).toContain('/etc/subzerodev');
    expect(dockerfile).toContain('/var/lib/subzerodev/cache');
    expect(dockerfile).toContain('/var/lib/subzerodev/output');
    expect(dockerfile).toContain('com.subzerodev.plugin.id="subzerodev.github"');
    expect(dockerfile).toContain('ENTRYPOINT ["node", "dist/cli.js"]');
    expect(dockerfile).not.toMatch(/^VOLUME/m);
  });

  it('keeps the seeded read-only export fixture valid', async () => {
    const cache = new RepositoryCache(nodeFileSystem, resolve('tests/fixtures/cache/seeded'));
    await expect(cache.read()).resolves.toMatchObject({
      owner: { providerId: '99' },
      projects: [{ project: { repository: { identity: { providerId: '1' } } } }],
    });
  });

  it('runs the dedicated container job in CI', () => {
    const workflow = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain('container:');
    expect(workflow).toContain('./build/Test-Container.ps1 -Build');
  });
});
