import { RepositoryCache } from '../cache/store.js';
import {
  loadConfiguration,
  resolveConfiguration,
  type ResolvedConfiguration,
} from '../configuration/index.js';
import { createLogger, type LogLevel, type Logger } from '../logging/logger.js';
import { createGitHubCommandProvider } from '../providers/github/command-provider.js';
import type { RepositoryProvider } from '../providers/provider.js';

import { nodeFileSystem } from './node-file-system.js';
import type { FileSystemPort } from './ports.js';

export interface CommandContext {
  readonly configuration: ResolvedConfiguration;
  readonly logger: Logger;
  readonly cache: RepositoryCache;
  readonly fileSystem: FileSystemPort;
  createProvider(): Promise<ProviderContext>;
}

export interface ProviderContext {
  readonly token: import('../configuration/environment.js').ResolvedToken;
  /** Credential-source diagnostics preserved for validate and the run report. */
  readonly tokenNotes: readonly string[];
  readonly provider: RepositoryProvider;
}

/** Builds the operational graph once; command modules only receive the completed context. */
export async function createCommandContext(input: {
  readonly configPath: string;
  readonly logLevel: LogLevel;
  readonly quiet: boolean;
  readonly environment?: Readonly<NodeJS.ProcessEnv>;
}): Promise<CommandContext> {
  const environment = input.environment ?? process.env;
  const loaded = await loadConfiguration(input.configPath);
  const configuration = resolveConfiguration(loaded.configuration, loaded.directory);
  const logger = createLogger({ level: input.logLevel, quiet: input.quiet });
  return {
    configuration,
    logger,
    fileSystem: nodeFileSystem,
    cache: new RepositoryCache(nodeFileSystem, configuration.directories.cache),
    async createProvider(): Promise<ProviderContext> {
      return createGitHubCommandProvider({ configuration, logger, environment });
    },
  };
}
