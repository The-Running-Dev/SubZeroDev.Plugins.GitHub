import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { GLOBAL_OPTIONS } from '../../src/commands/global-options.js';
import { buildHelp } from '../../src/commands/help.js';
import { COMMAND_OPTIONS } from '../../src/models/command-options.js';
import { COMMAND_NAMES } from '../../src/commands/types.js';

describe('help and authored documentation', () => {
  it('mention every declared option', () => {
    const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
    const reference = readFileSync(
      new URL('../../docs/docs/reference/cli.md', import.meta.url),
      'utf8',
    );
    for (const option of Object.keys(GLOBAL_OPTIONS)) {
      expect(buildHelp()).toContain(`--${option}`);
      expect(readme).toContain(`--${option}`);
      expect(reference).toContain(`--${option}`);
    }
    for (const command of COMMAND_NAMES) {
      for (const option of Object.keys(COMMAND_OPTIONS[command])) {
        expect(buildHelp(command)).toContain(`--${option}`);
        expect(readme).toContain(`--${option}`);
        expect(reference).toContain(`--${option}`);
      }
    }
  });
});
