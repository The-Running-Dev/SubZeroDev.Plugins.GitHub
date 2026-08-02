import { CacheError, RepositoryCache } from '../cache/store.js';
import type { CommandResult } from '../output/envelope.js';
import { applyPortfolioOverrides, type PortfolioOverrides } from './portfolio-service.js';

/** Reads only the local cache; it intentionally never constructs a provider or resolves a token. */
export async function listCachedRepositories(
  cache: RepositoryCache,
  limit = 100,
  overrides: PortfolioOverrides = new Map(),
): Promise<CommandResult> {
  let cached;
  try {
    cached = await cache.read();
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
  if (cached === null) {
    return {
      outcome: { kind: 'failed', exitCode: 3 },
      summary: 'No synchronized repository cache is available.',
      errors: [
        {
          code: 'cache_missing',
          message: 'Run sync before listing repositories.',
          retryable: false,
        },
      ],
    };
  }

  const projects = applyPortfolioOverrides(
    cached.projects.map(({ project }) => project),
    overrides,
  );
  const repositories = projects.slice(0, limit);
  const wasTruncated = repositories.length !== projects.length;
  return {
    outcome: { kind: 'succeeded' },
    summary: `Listed ${String(cached.repositories.length)} cached repositories.`,
    data: {
      synchronizedAt: cached.synchronizedAt,
      totalRepositories: projects.length,
      repositories: repositories.map((project) => ({
        id: project.repository.identity.providerId,
        slug: project.repository.slug,
        visibility: project.repository.visibility,
        status: project.repository.status,
        displayName: project.portfolio.displayName,
        hidden: project.portfolio.hidden,
      })),
    },
    ...(wasTruncated
      ? {
          warnings: [
            {
              code: 'list_truncated',
              message: `Listed the first ${String(limit)} repositories; ${String(projects.length)} are cached.`,
            },
          ],
        }
      : {}),
  };
}
