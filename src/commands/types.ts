import type { ParseArgsOptionsConfig } from 'node:util';

import type { CommandContext } from '../services/command-context.js';
import type { CommandResult } from '../output/envelope.js';

export const COMMAND_NAMES = ['manifest', 'validate', 'sync', 'list', 'stats', 'export'] as const;
export type CommandName = (typeof COMMAND_NAMES)[number];

export interface CommandModule {
  readonly name: CommandName;
  readonly options: ParseArgsOptionsConfig;
  readonly requiresContext: boolean;
  readonly sideEffecting: boolean;
}

export interface OperationalCommandModule extends CommandModule {
  run(context: CommandContext, invocation: CommandInvocation): Promise<CommandResult>;
}

export interface CommandInvocation {
  readonly global: {
    readonly outputFormat: 'text' | 'json';
    readonly dryRun: boolean;
  };
  readonly values: Readonly<Record<string, string | boolean | readonly string[] | undefined>>;
}

export function isCommandName(value: string): value is CommandName {
  return COMMAND_NAMES.some((command) => command === value);
}
