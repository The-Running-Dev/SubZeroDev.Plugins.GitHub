import { RepositoryCache } from '../cache/store.js';
import {
  loadConfiguration,
  resolveConfiguration,
  resolveToken,
  type ResolvedConfiguration,
  type ResolvedToken,
} from '../configuration/index.js';
import { createLogger, type LogLevel, type Logger } from '../logging/logger.js';
import { createGhCliCredentialSource } from '../providers/github/gh-cli-credentials.js';
import { GitHubProvider } from '../providers/github/github-provider.js';

import { nodeFileSystem } from './node-file-system.js';
import { systemClock, systemSleeper } from './system.js';

export interface CommandContext {
  readonly configuration: ResolvedConfiguration;
  readonly logger: Logger;
  readonly cache: RepositoryCache;
  createProvider(): Promise<ProviderContext>;
}

export interface ProviderContext {
  readonly token: ResolvedToken;
  /** Credential-source diagnostics preserved for validate and the run report. */
  readonly tokenNotes: readonly string[];
  readonly provider: GitHubProvider;
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
    cache: new RepositoryCache(nodeFileSystem, configuration.directories.cache),
    async createProvider(): Promise<ProviderContext> {
      const tokenResolution = await resolveToken({
        environment,
        environmentVariable: configuration.auth.tokenEnvironmentVariable,
        allowGhCliTokenReuse: configuration.auth.allowGhCliTokenReuse,
        ...(configuration.auth.allowGhCliTokenReuse
          ? { ghCli: createGhCliCredentialSource(nodeFileSystem, environment) }
          : {}),
      });
      return {
        token: tokenResolution.token,
        tokenNotes: tokenResolution.notes,
        provider: new GitHubProvider({
          token: tokenResolution.token,
          logger,
          sleeper: systemSleeper,
          clock: systemClock,
          budget: {
            warnAtPercentConsumed: configuration.budget.warnAtPercentConsumed,
            stopAtPercentConsumed: configuration.budget.stopAtPercentConsumed,
          },
          userAgent: '@subzerodev/plugin-github',
          documentationUrlTemplate: configuration.documentation.urlTemplate,
        }),
      };
    },
  };
}
