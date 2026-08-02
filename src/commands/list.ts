import { listCachedRepositories } from '../services/list-service.js';
import { LIST_OPTIONS } from '../models/command-options.js';
import { failedOutcome } from './outcome.js';
import { loadPortfolioOverrides } from '../services/portfolio-service.js';

import type { OperationalCommandModule } from './types.js';

export const listCommand: OperationalCommandModule = {
  name: 'list',
  options: LIST_OPTIONS,
  requiresContext: true,
  sideEffecting: false,
  async run(context, invocation) {
    const rawLimit = invocation.values['limit'];
    const limit = rawLimit === undefined ? 100 : Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      return {
        outcome: failedOutcome('usage'),
        summary: 'Repository list limit is invalid.',
        errors: [
          {
            code: 'invalid_list_limit',
            message: '--limit must be an integer from 1 through 1000.',
            retryable: false,
          },
        ],
      };
    }
    const overrides = await loadPortfolioOverrides(
      context.fileSystem,
      context.configuration.portfolio.overrides,
    );
    return listCachedRepositories(context.cache, limit, overrides);
  },
};

export { LIST_OPTIONS };

export default listCommand;
