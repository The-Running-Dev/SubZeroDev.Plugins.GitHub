import { CacheError, type RepositoryCache } from '../cache/store.js';
import type { CommandResult } from '../output/envelope.js';
import { calculateAggregateStatistics } from './statistics-service.js';
import { applyPortfolioOverrides, type PortfolioOverrides } from './portfolio-service.js';

export async function calculateCachedStatistics(
  cache: RepositoryCache,
  overrides: PortfolioOverrides = new Map(),
): Promise<CommandResult> {
  let snapshot;
  try {
    snapshot = await cache.read();
  } catch (error: unknown) {
    if (error instanceof CacheError) {
      return {
        outcome: { kind: 'failed', exitCode: 3 },
        summary: 'The repository cache is invalid.',
        errors: [{ code: 'cache_invalid', message: error.message, retryable: false }],
      };
    }
    throw error;
  }
  if (snapshot === null) {
    return {
      outcome: { kind: 'failed', exitCode: 3 },
      summary: 'No synchronized repository cache is available.',
      errors: [{ code: 'cache_missing', message: 'Run sync before stats.', retryable: false }],
    };
  }
  return {
    outcome: { kind: 'succeeded' },
    summary: `Calculated statistics for ${String(snapshot.projects.length)} repositories.`,
    data: {
      statistics: calculateAggregateStatistics(
        applyPortfolioOverrides(
          snapshot.projects.map(({ project }) => project),
          overrides,
        ),
      ),
    },
  };
}
