import type { ParseArgsOptionsConfig } from 'node:util';

export const VALIDATE_OPTIONS = {} as const satisfies ParseArgsOptionsConfig;

export const SYNC_OPTIONS = {
  profile: { type: 'string' },
  'no-cache': { type: 'boolean' },
  'include-forks': { type: 'boolean' },
} as const satisfies ParseArgsOptionsConfig;

export const LIST_OPTIONS = {
  limit: { type: 'string' },
} as const satisfies ParseArgsOptionsConfig;

export const STATS_OPTIONS = {} as const satisfies ParseArgsOptionsConfig;

export const EXPORT_OPTIONS = {
  format: { type: 'string', multiple: true },
  output: { type: 'string' },
} as const satisfies ParseArgsOptionsConfig;

export const COMMAND_OPTIONS = {
  manifest: {},
  validate: VALIDATE_OPTIONS,
  sync: SYNC_OPTIONS,
  list: LIST_OPTIONS,
  stats: STATS_OPTIONS,
  export: EXPORT_OPTIONS,
} as const satisfies Readonly<Record<string, ParseArgsOptionsConfig>>;
