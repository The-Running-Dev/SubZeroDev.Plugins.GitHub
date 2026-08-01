import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

describe('publishable package metadata', () => {
  const metadata = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
    name: string;
    version: string;
    private?: boolean;
    license?: string;
    repository?: { url?: string };
    homepage?: string;
    files?: string[];
    bin?: Record<string, string>;
  };

  it('declares public npm distribution metadata and allowlisted contents', () => {
    expect(metadata).not.toHaveProperty('private');
    expect(metadata).toMatchObject({
      name: '@subzerodev/plugins-github',
      license: 'MIT',
      homepage: 'https://plugins-github.subzerodev.com',
      files: ['dist', 'schemas', 'plugin.yaml'],
    });
    expect(metadata.repository?.url).toContain('SubZeroDev.Plugins.GitHub');
  });

  it('exposes install and npx binary names with executable targets', () => {
    expect(Object.keys(metadata.bin ?? {}).sort()).toEqual([
      'plugins-github',
      'subzerodev-github',
      'sz-github',
    ]);
    for (const target of Object.values(metadata.bin ?? {})) {
      expect(readFileSync(resolve(target), 'utf8')).toMatch(/^#!\/usr\/bin\/env node/);
    }
  });

  it('keeps package and plugin versions aligned', () => {
    const manifest = parse(readFileSync(resolve('plugin.yaml'), 'utf8')) as { version: string };
    expect(metadata.version).toBe(manifest.version);
  });
});
