import { STATS_OPTIONS } from '../models/command-options.js';
import { calculateCachedStatistics } from '../services/cached-statistics-service.js';
import { loadPortfolioOverrides } from '../services/portfolio-service.js';

import type { OperationalCommandModule } from './types.js';

export { STATS_OPTIONS };

export const statsCommand: OperationalCommandModule = {
  name: 'stats',
  options: STATS_OPTIONS,
  requiresContext: true,
  sideEffecting: false,
  async run(context) {
    const overrides = await loadPortfolioOverrides(
      context.fileSystem,
      context.configuration.portfolio.overrides,
    );
    return calculateCachedStatistics(context.cache, overrides);
  },
};

export default statsCommand;
