import { describe, expect, it } from 'vitest';

import { splitAtCommand } from '../../src/commands/global-options.js';

describe('splitAtCommand', () => {
  it('does not mistake a global option value for a command', () => {
    expect(splitAtCommand(['--config', 'sync', 'manifest'])).toEqual({
      before: ['--config', 'sync'],
      command: 'manifest',
      after: [],
    });
  });

  it('finds commands after global options', () => {
    expect(splitAtCommand(['--log-level=trace', 'manifest', '--json'])).toEqual({
      before: ['--log-level=trace'],
      command: 'manifest',
      after: ['--json'],
    });
  });
});
