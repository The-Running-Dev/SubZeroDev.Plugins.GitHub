import { CacheError, RepositoryCache } from '../cache/store.js';
import type { CommandResult } from '../output/envelope.js';

const MAXIMUM_LISTED_REPOSITORIES = 100;

/** Reads only the local cache; it intentionally never constructs a provider or resolves a token. */
export async function listCachedRepositories(cache: RepositoryCache): Promise<CommandResult> {
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

  const repositories = cached.repositories.slice(0, MAXIMUM_LISTED_REPOSITORIES);
  const wasTruncated = repositories.length !== cached.repositories.length;
  return {
    outcome: { kind: 'succeeded' },
    summary: `Listed ${String(cached.repositories.length)} cached repositories.`,
    data: {
      synchronizedAt: cached.synchronizedAt,
      totalRepositories: cached.repositories.length,
      repositories: repositories.map((repository) => ({
        id: repository.identity.providerId,
        slug: repository.slug,
        visibility: repository.visibility,
        status: repository.status,
      })),
    },
    ...(wasTruncated
      ? {
          warnings: [
            {
              code: 'list_truncated',
              message: `Listed the first ${String(MAXIMUM_LISTED_REPOSITORIES)} repositories; ${String(cached.repositories.length)} are cached.`,
            },
          ],
        }
      : {}),
  };
}
