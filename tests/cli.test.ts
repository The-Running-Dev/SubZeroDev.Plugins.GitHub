import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isEntryPoint, readVersion, runCli } from '../src/cli.js';

describe('CLI', () => {
  it('prints help when no command is supplied', () => {
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    expect(runCli([])).toBe(0);
    expect(output).toHaveBeenCalledWith(
      expect.stringContaining('subzerodev-github <command> [options]'),
    );

    output.mockRestore();
  });

  it('rejects an unknown command', () => {
    const output = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(runCli(['unknown'])).toBe(2);
    expect(output).toHaveBeenCalledWith(expect.stringContaining('Unknown command: unknown'));

    output.mockRestore();
  });

  it('reports invalid options instead of throwing', () => {
    const output = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(runCli(['--unknown'])).toBe(2);
    expect(output).toHaveBeenCalledWith(expect.stringContaining('Invalid arguments'));

    output.mockRestore();
  });

  it('reports an invalid option supplied after a command', () => {
    const output = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(runCli(['sync', '--bogus'])).toBe(2);
    expect(output).toHaveBeenCalledWith(expect.stringContaining('Invalid arguments'));

    output.mockRestore();
  });

  it('prints the package version rather than a hard-coded string', () => {
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const expected = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };

    expect(runCli(['--version'])).toBe(0);
    expect(output).toHaveBeenCalledWith(`${expected.version}\n`);
    expect(readVersion()).toBe(expected.version);

    output.mockRestore();
  });
});

// Windows only permits symlink creation under Developer Mode or elevation, which
// is a machine setting the code under test cannot influence. Probe once so the
// symlink case skips there instead of failing, and keep it mandatory everywhere
// else. Windows loses nothing real: npm installs a `.cmd` shim rather than a
// symlink there, and the shim invokes node with the module's actual path, which
// is the "direct invocation" case asserted below.
function detectSymlinkSupport(): boolean {
  const probe = realpathSync(mkdtempSync(join(tmpdir(), 'subzerodev-symlink-probe-')));

  try {
    const target = join(probe, 'target.js');
    writeFileSync(target, '');
    symlinkSync(target, join(probe, 'link.js'));
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
}

const symlinksSupported = detectSymlinkSupport();

describe('entry point detection', () => {
  let directory: string;
  let modulePath: string;

  beforeEach(() => {
    // The temporary directory is resolved because macOS exposes it through a symlink.
    directory = realpathSync(mkdtempSync(join(tmpdir(), 'subzerodev-cli-')));
    modulePath = join(directory, 'cli.js');
    writeFileSync(modulePath, '');
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it.skipIf(!symlinksSupported)('detects invocation through an installed binary symlink', () => {
    const binary = join(directory, 'subzerodev-github');
    symlinkSync(modulePath, binary);

    expect(isEntryPoint(pathToFileURL(modulePath).href, binary)).toBe(true);
  });

  // Also the Windows install path, where npm's shim invokes node with this path.
  it('detects direct invocation of the module', () => {
    expect(isEntryPoint(pathToFileURL(modulePath).href, modulePath)).toBe(true);
  });

  it('ignores an unrelated entry point', () => {
    const other = join(directory, 'other.js');
    writeFileSync(other, '');

    expect(isEntryPoint(pathToFileURL(modulePath).href, other)).toBe(false);
  });

  it('ignores a missing or absent entry point', () => {
    expect(isEntryPoint(pathToFileURL(modulePath).href, undefined)).toBe(false);
    expect(isEntryPoint(pathToFileURL(modulePath).href, join(directory, 'gone.js'))).toBe(false);
  });
});
