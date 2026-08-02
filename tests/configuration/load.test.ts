import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConfigurationError } from '../../src/configuration/errors.js';
import { loadConfiguration } from '../../src/configuration/load.js';
import { resolveConfiguration } from '../../src/configuration/resolve.js';
import { configurationSchema } from '../../src/configuration/schema.js';

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'subzerodev-config-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function write(contents: string): string {
  const path = join(directory, 'github.config.json');
  writeFileSync(path, contents, 'utf8');
  return path;
}

describe('configuration loading', () => {
  it('reports an unreadable file with a stable code', async () => {
    await expect(loadConfiguration(join(directory, 'absent.json'))).rejects.toMatchObject({
      name: 'ConfigurationError',
      code: 'config_unreadable',
    });
  });

  it('reports malformed JSON rather than throwing a SyntaxError', async () => {
    const path = write('{ "configVersion": "1.0.0", ');

    await expect(loadConfiguration(path)).rejects.toBeInstanceOf(ConfigurationError);
  });

  it('reports an invalid configuration with the offending key path', async () => {
    const path = write('{ "configVersion": "1.0.0", "collection": { "profile": "exhaustive" } }');

    await expect(loadConfiguration(path)).rejects.toMatchObject({
      code: 'config_invalid',
      pointer: 'collection.profile',
    });
  });
});

describe('configuration path resolution', () => {
  it('resolves directories relative to the configuration file, not the working directory', async () => {
    const path = write(
      '{ "configVersion": "1.0.0", "directories": { "cache": "../shared-cache", "output": "out" } }',
    );
    const loaded = await loadConfiguration(path);
    const resolved = resolveConfiguration(loaded.configuration, loaded.directory);

    // The working directory here is the repository root — deliberately not the
    // configuration's directory. Conflating the two bases is the documented failure:
    // the same configuration would then mean different paths depending on where the
    // command was invoked from.
    expect(process.cwd()).not.toBe(directory);
    expect(resolved.directories.cache).toBe(resolve(directory, '../shared-cache'));
    expect(resolved.directories.output).toBe(join(directory, 'out'));
    expect(resolved.directories.cache).not.toContain(process.cwd());
  });

  it('leaves an absolute directory untouched', async () => {
    const absolute = join(directory, 'absolute-cache');
    const path = write(
      `{ "configVersion": "1.0.0", "directories": { "cache": ${JSON.stringify(absolute)} } }`,
    );
    const loaded = await loadConfiguration(path);

    expect(resolveConfiguration(loaded.configuration, loaded.directory).directories.cache).toBe(
      absolute,
    );
  });

  it('resolves a portfolio override file relative to configuration', async () => {
    const path = write(
      '{ "configVersion": "1.0.0", "portfolio": { "overrides": "portfolio.json" } }',
    );
    const loaded = await loadConfiguration(path);

    expect(resolveConfiguration(loaded.configuration, loaded.directory).portfolio.overrides).toBe(
      join(directory, 'portfolio.json'),
    );
  });

  it('lets contract path environment variables override file paths', () => {
    const configuration = configurationSchema.parse({ configVersion: '1.0.0' });
    const resolved = resolveConfiguration(configuration, directory, {
      SUBZERODEV_PLUGIN_CACHE: '../mounted-cache',
      SUBZERODEV_PLUGIN_OUTPUT: 'mounted-output',
    });

    expect(resolved.directories.cache).toBe(resolve(directory, '../mounted-cache'));
    expect(resolved.directories.output).toBe(resolve(directory, 'mounted-output'));
  });
});
