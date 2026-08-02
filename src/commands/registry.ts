import { type CommandModule, type CommandName } from './types.js';

/**
 * Commands are loaded lazily so `manifest` never evaluates an operational command
 * graph. M3.5b supplies the remaining modules; their entries belong here rather
 * than in the CLI bootstrap.
 */
export const commandLoaders: Readonly<Partial<Record<CommandName, () => Promise<CommandModule>>>> =
  {
    manifest: async () => (await import('./manifest.js')).default,
    validate: async () => (await import('./validate.js')).default,
    sync: async () => (await import('./sync.js')).default,
    list: async () => (await import('./list.js')).default,
    stats: async () => (await import('./stats.js')).default,
    export: async () => (await import('./export.js')).default,
  };
