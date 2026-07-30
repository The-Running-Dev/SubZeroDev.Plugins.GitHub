import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const cli = resolve(root, 'dist/cli.js');
const builtManifest = resolve(root, 'dist/plugin.manifest.json');

describe('manifest command', () => {
  it('needs no configuration or credential and prints the build-produced bytes verbatim', () => {
    const expected = readFileSync(builtManifest, 'utf8');
    const output = execFileSync(process.execPath, [cli, 'manifest'], {
      cwd: root,
      env: {},
      encoding: 'utf8',
    });

    expect(output).toBe(expected);
    expect(JSON.parse(output)).toMatchObject({ id: 'subzerodev.github', schemaVersion: '1.0.0' });
  });
});
