import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

import { ConfigurationError } from '../../src/configuration/errors.js';
import { resolveToken } from '../../src/configuration/environment.js';
import {
  createGhCliCredentialSource,
  ghConfigPath,
} from '../../src/providers/github/gh-cli-credentials.js';
import { clearRegisteredSecrets, registeredSecrets } from '../../src/logging/secret-registry.js';
import { memoryFileSystem } from '../support/fake-ports.js';

const ENV_VAR = 'GITHUB_TOKEN';
const ENV_TOKEN = 'ghp_environment_token_fixture';
const GH_TOKEN = 'gho_fixture_token_value_not_real';

const ghFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/gh-cli/${name}.yml`, import.meta.url), 'utf8');

function ghCliAt(path: string, fixture: string) {
  const environment = { GH_CONFIG_DIR: '/gh' };
  const fileSystem = memoryFileSystem({ [path]: ghFixture(fixture) });
  return createGhCliCredentialSource(fileSystem, environment);
}

const CONFIG_DIR_ENV = { GH_CONFIG_DIR: '/gh' } as const;
const hostsPath = ghConfigPath(CONFIG_DIR_ENV);

afterEach(() => {
  clearRegisteredSecrets();
});

describe('token resolution', () => {
  it('prefers the environment even when gh reuse is enabled', async () => {
    const { token, notes } = await resolveToken({
      environment: { [ENV_VAR]: ENV_TOKEN },
      environmentVariable: ENV_VAR,
      allowGhCliTokenReuse: true,
      ghCli: ghCliAt(hostsPath, 'valid-hosts'),
    });

    // Someone who exported a token meant that token; a broader gh session must not
    // silently win.
    expect(token.source).toBe('environment');
    expect(token.value).toBe(ENV_TOKEN);
    expect(token.credentialPath).toBeNull();
    expect(notes).toEqual([]);
  });

  it('registers the resolved token for redaction', async () => {
    await resolveToken({
      environment: { [ENV_VAR]: ENV_TOKEN },
      environmentVariable: ENV_VAR,
      allowGhCliTokenReuse: false,
    });

    // The whole point of registering here: nothing downstream has to thread the
    // value through the call graph to keep it out of a log record.
    expect(registeredSecrets()).toContain(ENV_TOKEN);
  });

  it('refuses without a token and without reuse, naming the variable', async () => {
    await expect(
      resolveToken({
        environment: {},
        environmentVariable: ENV_VAR,
        allowGhCliTokenReuse: false,
      }),
    ).rejects.toMatchObject({ name: 'ConfigurationError', code: 'token_missing' });
  });

  it('falls back to the gh credential and records where it came from', async () => {
    const { token, notes } = await resolveToken({
      environment: {},
      environmentVariable: ENV_VAR,
      allowGhCliTokenReuse: true,
      ghCli: ghCliAt(hostsPath, 'valid-hosts'),
    });

    expect(token.source).toBe('gh-cli');
    expect(token.value).toBe(GH_TOKEN);
    expect(token.credentialPath).toBe(hostsPath);
    expect(token.environmentVariable).toBeNull();
    // Recorded, never silent: the note says the scopes may be broader than needed.
    expect(notes.join(' ')).toContain(hostsPath);
    expect(registeredSecrets()).toContain(GH_TOKEN);
  });

  it('names the path it checked when reuse is on but no credential exists', async () => {
    const promise = resolveToken({
      environment: {},
      environmentVariable: ENV_VAR,
      allowGhCliTokenReuse: true,
      ghCli: createGhCliCredentialSource(memoryFileSystem(), CONFIG_DIR_ENV),
    });

    // "Enabled but not found" and "not enabled" are different situations, and only
    // one of them is fixed by running `gh auth login`.
    await expect(promise).rejects.toBeInstanceOf(ConfigurationError);
    await expect(promise).rejects.toThrow(/gh auth login/);
  });
});

describe('gh credential reader', () => {
  it('returns null for a hosts file without a github.com entry', async () => {
    const source = ghCliAt(hostsPath, 'missing-host');
    expect(await source.read()).toBeNull();
  });

  it('returns null for malformed YAML rather than throwing', async () => {
    const source = ghCliAt(hostsPath, 'malformed');
    expect(await source.read()).toBeNull();
  });

  it('honours GH_CONFIG_DIR over the platform default', () => {
    expect(ghConfigPath({ GH_CONFIG_DIR: '/custom/gh' })).toMatch(/hosts\.yml$/);
    expect(ghConfigPath({ GH_CONFIG_DIR: '/custom/gh' })).toContain('custom');
  });
});
