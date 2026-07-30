import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const manifestModule = resolve(import.meta.dirname, '../../dist/commands/manifest.js');

describe('manifest isolation', () => {
  it('has no operational or third-party imports in its built module', () => {
    const source = readFileSync(manifestModule, 'utf8');
    const imports = [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => match[1]);

    expect(imports).toEqual(['node:fs']);
    expect(source).not.toMatch(/configuration|providers|cache|services|node_modules/);
  });
});
