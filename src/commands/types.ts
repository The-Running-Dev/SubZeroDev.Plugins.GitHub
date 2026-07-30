import type { ParseArgsOptionsConfig } from 'node:util';

export const COMMAND_NAMES = ['manifest', 'validate', 'sync', 'list', 'stats', 'export'] as const;
export type CommandName = (typeof COMMAND_NAMES)[number];

export interface CommandModule {
  readonly name: CommandName;
  readonly options: ParseArgsOptionsConfig;
  readonly requiresContext: boolean;
  readonly sideEffecting: boolean;
}

export function isCommandName(value: string): value is CommandName {
  return COMMAND_NAMES.some((command) => command === value);
}
