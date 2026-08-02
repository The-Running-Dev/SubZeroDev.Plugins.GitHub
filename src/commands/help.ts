import { GLOBAL_OPTIONS } from './global-options.js';
import { COMMAND_OPTIONS } from '../models/command-options.js';
import type { CommandName } from './types.js';

const COMMAND_DESCRIPTIONS: Readonly<Record<CommandName, string>> = {
  manifest: 'Print the canonical plugin manifest',
  validate: 'Validate configuration, credentials, and cache readiness',
  sync: 'Download or incrementally update repository data',
  list: 'Display repositories from the local cache',
  stats: 'Display aggregate repository statistics',
  export: 'Export normalized project documents',
};

export function buildHelp(command?: CommandName): string {
  const options =
    command === undefined ? GLOBAL_OPTIONS : { ...GLOBAL_OPTIONS, ...COMMAND_OPTIONS[command] };
  const usage =
    command === undefined
      ? '  subzerodev-github <command> [options]'
      : `  subzerodev-github ${command} [options]`;
  const commands =
    command === undefined
      ? `\nCommands:\n${Object.entries(COMMAND_DESCRIPTIONS)
          .map(([name, description]) => `  ${name.padEnd(9)} ${description}`)
          .join('\n')}\n`
      : `\n${COMMAND_DESCRIPTIONS[command]}\n`;
  return `SubZeroDev GitHub Plugin\n\nUsage:\n${usage}\n${commands}\nOptions:\n${Object.entries(
    options,
  )
    .map(([name, definition]) => optionLine(name, definition))
    .join('\n')}\n`;
}

function optionLine(
  name: string,
  definition: {
    readonly type: 'string' | 'boolean';
    readonly short?: string;
    readonly multiple?: boolean;
  },
): string {
  const short = definition.short === undefined ? '' : `-${definition.short}, `;
  const value = definition.type === 'string' ? ' <value>' : '';
  return `  ${short}--${name}${value}`;
}
