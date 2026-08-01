import { synchronizeRepositories } from '../services/sync-service.js';
import { RawResponseStore } from '../cache/raw-store.js';
import { nodeFileSystem } from '../services/node-file-system.js';

import type { OperationalCommandModule } from './types.js';

export const syncCommand: OperationalCommandModule = {
  name: 'sync',
  options: {},
  requiresContext: true,
  sideEffecting: true,
  async run(context) {
    const providerContext = await context.createProvider();
    const result = await synchronizeRepositories({
      provider: providerContext.provider,
      cache: context.cache,
      filter: context.configuration.repositories,
      profile: context.configuration.collection.profile,
      concurrency: context.configuration.budget.concurrency,
      synchronizedAt: new Date().toISOString(),
      ...(context.configuration.output.retainRawResponses
        ? {
            rawStore: new RawResponseStore(
              nodeFileSystem,
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

export default syncCommand;
