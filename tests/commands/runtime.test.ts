import { describe, expect, it, vi } from 'vitest';

import { runCliAsync } from '../../src/cli.js';

describe('operational command runtime', () => {
  it('returns one structured envelope when configuration cannot be read', async () => {
    let output = '';
    const stdout = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        output += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
        return true;
      });

    try {
      await expect(runCliAsync(['validate', '--config', 'missing-config.json'])).resolves.toBe(2);

      expect(output.endsWith('\n')).toBe(true);
      expect(JSON.parse(output)).toMatchObject({
        command: 'validate',
        status: 'failed',
        exitCode: 2,
        errors: [{ code: 'config_unreadable' }],
      });
    } finally {
      stdout.mockRestore();
    }
  });
});
