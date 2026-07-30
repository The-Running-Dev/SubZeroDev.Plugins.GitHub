import type { Repository } from '../models/repository.js';
import type { CommandResult, ErrorDiagnostic } from '../output/envelope.js';
import type { RepositoryProvider } from '../providers/provider.js';
import { RepositoryCache } from '../cache/store.js';

/** M3.5 synchronization: discover core metadata, then publish it only when complete. */
export async function synchronizeRepositories(input: {
  readonly provider: RepositoryProvider;
  readonly cache: RepositoryCache;
  readonly filter: Parameters<RepositoryProvider['discover']>[0];
  readonly synchronizedAt: string;
}): Promise<CommandResult> {
  const repositories: Repository[] = [];
  const errors: ErrorDiagnostic[] = [];
  for await (const discovered of input.provider.discover(input.filter)) {
    if (discovered.ok) {
      repositories.push(discovered.value.repository);
      continue;
    }
    errors.push({
      code: discovered.error.code,
      message: discovered.error.message,
      retryable: discovered.error.retryable,
    });
    break;
  }

  if (errors.length > 0) {
    return {
      outcome: {
        kind: repositories.length > 0 ? 'partial' : 'failed',
        ...(repositories.length > 0 ? {} : { exitCode: exitCodeFor(errors[0]?.code) }),
      } as CommandResult['outcome'],
      summary:
        repositories.length > 0
          ? 'Repository synchronization was incomplete; the existing cache was preserved.'
          : 'Repository synchronization failed before the cache could be updated.',
      data: {
        discoveredRepositories: repositories.length,
        cacheWritePerformed: false,
        requestUsage: input.provider.usage(),
      },
      errors,
    };
  }

  await input.cache.write(repositories, input.synchronizedAt);
  return {
    outcome: { kind: 'succeeded' },
    summary: `Synchronized ${String(repositories.length)} repositories.`,
    data: {
      discoveredRepositories: repositories.length,
      cacheWritePerformed: true,
      requestUsage: input.provider.usage(),
    },
  };
}

function exitCodeFor(code: string | undefined): 2 | 3 | 5 | 6 {
  if (code === 'github_unauthenticated' || code === 'github_forbidden') return 5;
  if (
    code === 'github_rate_limited' ||
    code === 'github_secondary_rate_limit' ||
    code === 'github_budget_stopped'
  )
    return 6;
  return 3;
}
