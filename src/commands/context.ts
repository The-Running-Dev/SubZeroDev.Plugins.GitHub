import { RepositoryCache } from '../cache/store.js';
import { createGhCliCredentialSource } from '../providers/github/gh-cli-credentials.js';
import { GitHubProvider } from '../providers/github/github-provider.js';
import { createLogger, type LogLevel, type Logger } from '../logging/logger.js';
import {
  loadConfiguration,
  resolveConfiguration,
  resolveToken,
  type ResolvedConfiguration,
  type ResolvedToken,
} from '../configuration/index.js';
import { nodeFileSystem } from '../services/node-file-system.js';
import { systemClock, systemSleeper } from '../services/system.js';

export interface CommandContext {
  readonly configuration: ResolvedConfiguration;
  readonly token: ResolvedToken;
  readonly logger: Logger;
  readonly provider: GitHubProvider;
  readonly cache: RepositoryCache;
}

/** Builds the operational graph exactly once; `manifest` deliberately never calls this. */
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
  const { token } = await resolveToken({
    environment,
    environmentVariable: configuration.auth.tokenEnvironmentVariable,
    allowGhCliTokenReuse: configuration.auth.allowGhCliTokenReuse,
    ...(configuration.auth.allowGhCliTokenReuse
      ? { ghCli: createGhCliCredentialSource(nodeFileSystem, environment) }
      : {}),
  });

  return {
    configuration,
    token,
    logger,
    provider: new GitHubProvider({
      token,
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
    cache: new RepositoryCache(nodeFileSystem, configuration.directories.cache),
  };
}
