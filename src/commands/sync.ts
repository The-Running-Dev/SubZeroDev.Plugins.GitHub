import { RawResponseStore } from '../cache/raw-store.js';
import { SYNC_OPTIONS } from '../models/command-options.js';
import { loadPortfolioOverrides } from '../services/portfolio-service.js';
import { synchronizeRepositories } from '../services/sync-service.js';

import { failedOutcome } from './outcome.js';
import type { OperationalCommandModule } from './types.js';

export const syncCommand: OperationalCommandModule = {
  name: 'sync',
  options: SYNC_OPTIONS,
  requiresContext: true,
  sideEffecting: true,
  async run(context, invocation) {
    const profileValue = invocation.values['profile'];
    if (
      profileValue !== undefined &&
      profileValue !== 'basic' &&
      profileValue !== 'standard' &&
      profileValue !== 'detailed'
    ) {
      return {
        outcome: failedOutcome('usage'),
        summary: 'Collection profile is invalid.',
        errors: [
          {
            code: 'invalid_collection_profile',
            message: '--profile must be basic, standard, or detailed.',
            retryable: false,
          },
        ],
      };
    }
    const providerContext = await context.createProvider();
    const portfolioOverrides = await loadPortfolioOverrides(
      context.fileSystem,
      context.configuration.portfolio.overrides,
    );
    const result = await synchronizeRepositories({
      provider: providerContext.provider,
      cache: context.cache,
      filter: {
        ...context.configuration.repositories,
        includeForks:
          invocation.values['include-forks'] === true
            ? true
            : context.configuration.repositories.includeForks,
      },
      profile: profileValue ?? context.configuration.collection.profile,
      concurrency: context.configuration.budget.concurrency,
      synchronizedAt: new Date().toISOString(),
      dryRun: invocation.global.dryRun,
      useCache: invocation.values['no-cache'] !== true,
      portfolioOverrides,
      ...(context.configuration.output.retainRawResponses && !invocation.global.dryRun
        ? {
            rawStore: new RawResponseStore(
              context.fileSystem,
              context.configuration.directories.output,
            ),
          }
        : {}),
    });
    return {
      ...result,
      warnings: [
        ...(result.warnings ?? []),
        ...providerContext.tokenNotes.map((message) => ({ code: 'token_reuse', message })),
      ],
    };
  },
};

export { SYNC_OPTIONS };

export default syncCommand;
