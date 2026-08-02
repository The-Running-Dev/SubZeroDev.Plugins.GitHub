import type { ResolvedConfiguration, ResolvedToken } from '../../configuration/index.js';
import { resolveToken } from '../../configuration/index.js';
import type { Logger } from '../../logging/logger.js';
import { nodeFileSystem } from '../../services/node-file-system.js';
import { systemClock, systemSleeper } from '../../services/system.js';

import { createGhCliCredentialSource } from './gh-cli-credentials.js';
import { GitHubProvider } from './github-provider.js';

export interface GitHubCommandProvider {
  readonly token: ResolvedToken;
  readonly tokenNotes: readonly string[];
  readonly provider: GitHubProvider;
}

/** GitHub credential acquisition and provider construction stay inside the provider boundary. */
export async function createGitHubCommandProvider(input: {
  readonly configuration: ResolvedConfiguration;
  readonly logger: Logger;
  readonly environment: Readonly<NodeJS.ProcessEnv>;
}): Promise<GitHubCommandProvider> {
  const tokenResolution = await resolveToken({
    environment: input.environment,
    environmentVariable: input.configuration.auth.tokenEnvironmentVariable,
    allowGhCliTokenReuse: input.configuration.auth.allowGhCliTokenReuse,
    ...(input.configuration.auth.allowGhCliTokenReuse
      ? { ghCli: createGhCliCredentialSource(nodeFileSystem, input.environment) }
      : {}),
  });
  return {
    token: tokenResolution.token,
    tokenNotes: tokenResolution.notes,
    provider: new GitHubProvider({
      token: tokenResolution.token,
      logger: input.logger,
      sleeper: systemSleeper,
      clock: systemClock,
      budget: {
        warnAtPercentConsumed: input.configuration.budget.warnAtPercentConsumed,
        stopAtPercentConsumed: input.configuration.budget.stopAtPercentConsumed,
      },
      userAgent: '@subzerodev/plugin-github',
      documentationUrlTemplate: input.configuration.documentation.urlTemplate,
      searchRequestsPerMinute: input.configuration.budget.searchRequestsPerMinute,
      retainRawResponses: input.configuration.output.retainRawResponses,
    }),
  };
}
