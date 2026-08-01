import { Writable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { runCli } from '../../src/cli.js';
import { buildHelp } from '../../src/commands/help.js';
import { failedOutcome, failureClassForCode } from '../../src/commands/outcome.js';
import { COMMAND_NAMES } from '../../src/commands/types.js';
import { GLOBAL_OPTIONS } from '../../src/commands/global-options.js';
import { COMMAND_OPTIONS } from '../../src/models/command-options.js';
import { buildEnvelope } from '../../src/output/envelope.js';
import { writeResult } from '../../src/output/render.js';

describe('CLI contract', () => {
  it('accepts command options and refuses conflicting output aliases', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(runCli(['sync', '--profile', 'basic'])).toBe(3);
      expect(runCli(['sync', '--json', '--output-format', 'text'])).toBe(2);
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('--json'));
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('--output-format'));
    } finally {
      stderr.mockRestore();
    }
  });

  it('generates help from every global and command option table', () => {
    const globalHelp = buildHelp();
    for (const option of Object.keys(GLOBAL_OPTIONS)) expect(globalHelp).toContain(`--${option}`);
    for (const command of COMMAND_NAMES) {
      const help = buildHelp(command);
      for (const option of Object.keys(COMMAND_OPTIONS[command])) {
        expect(help).toContain(`--${option}`);
      }
    }
  });

  it('maps failure classes and provider codes through one table', () => {
    expect(failedOutcome('usage').exitCode).toBe(2);
    expect(failedOutcome('operational').exitCode).toBe(3);
    expect(failedOutcome('authentication').exitCode).toBe(5);
    expect(failedOutcome('rate-limit').exitCode).toBe(6);
    expect(failureClassForCode('config_invalid')).toBe('usage');
    expect(failureClassForCode('github_unauthenticated')).toBe('authentication');
    expect(failureClassForCode('github_rate_limited')).toBe('rate-limit');
  });

  it('renders text or exactly one JSON envelope write', () => {
    const envelope = buildEnvelope({
      command: 'stats',
      pluginVersion: '0.1.0',
      startedAt: '2026-08-01T00:00:00Z',
      finishedAt: '2026-08-01T00:00:01Z',
      result: { outcome: { kind: 'succeeded' }, summary: 'Done.', data: { total: 1 } },
    });
    const json = sink();
    writeResult(envelope, 'json', json.stream);
    expect(json.writes).toHaveLength(1);
    expect(JSON.parse(json.output())).toMatchObject({ command: 'stats', exitCode: 0 });
    const text = sink();
    writeResult(envelope, 'text', text.stream);
    expect(text.output()).toContain('Done.');
    expect(text.output()).toContain('"total": 1');
  });
});

function sink(): { stream: Writable; writes: string[]; output(): string } {
  const writes: string[] = [];
  return {
    writes,
    stream: new Writable({
      write(chunk, _encoding, callback) {
        writes.push(String(chunk));
        callback();
      },
    }),
    output: () => writes.join(''),
  };
}
