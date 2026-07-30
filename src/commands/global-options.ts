import type { ParseArgsOptionsConfig } from 'node:util';

import { isCommandName, type CommandName } from './types.js';

export const GLOBAL_OPTIONS: ParseArgsOptionsConfig = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  'output-format': { type: 'string' },
  json: { type: 'boolean' },
  config: { type: 'string' },
  'log-level': { type: 'string' },
  quiet: { type: 'boolean' },
  'dry-run': { type: 'boolean' },
};

const VALUE_OPTIONS = new Set(['--output-format', '--config', '--log-level']);

export interface CommandSplit {
  readonly before: readonly string[];
  readonly command: CommandName | null;
  readonly after: readonly string[];
}

/** Finds a command without mistaking a value such as `--config sync` for one. */
export function splitAtCommand(argv: readonly string[]): CommandSplit {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) break;
    if (VALUE_OPTIONS.has(argument)) {
      index += 1;
      continue;
    }
    if (argument.startsWith('--') && argument.includes('=')) continue;
    if (isCommandName(argument)) {
      return { before: argv.slice(0, index), command: argument, after: argv.slice(index + 1) };
    }
  }
  return { before: argv, command: null, after: [] };
}
