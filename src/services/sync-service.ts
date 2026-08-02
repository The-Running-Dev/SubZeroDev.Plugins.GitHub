import { CacheError, CacheVersionError, RepositoryCache } from '../cache/store.js';
import type { CachedProject } from '../cache/reconcile.js';
import { reconcileProjects } from '../cache/reconcile.js';
import type { ProjectIdentity } from '../models/identity.js';
import { projectSchema, SCHEMA_VERSION, type Project } from '../models/project.js';
import type { CommandResult, Diagnostic, ErrorDiagnostic } from '../output/envelope.js';
import type {
  CollectionProfile,
  CollectionResult,
  DiscoveredRepository,
  RepositoryProvider,
} from '../providers/provider.js';
import { mapConcurrent } from './concurrency.js';

export async function synchronizeRepositories(input: {
  readonly provider: RepositoryProvider;
  readonly cache: RepositoryCache;
  readonly filter: Parameters<RepositoryProvider['discover']>[0];
  readonly profile: CollectionProfile;
  readonly concurrency: number;
  readonly synchronizedAt: string;
}): Promise<CommandResult> {
  let previous: Awaited<ReturnType<RepositoryCache['read']>>;
  const cacheWarnings: Diagnostic[] = [];
  try {
    previous = await input.cache.read();
  } catch (error: unknown) {
    if (error instanceof CacheVersionError) {
      return failed(
        2,
        'The cache version is incompatible.',
        'cache_version_incompatible',
        error.message,
      );
    }
    if (error instanceof CacheError) {
      previous = null;
      cacheWarnings.push({
        code: 'cache_invalid_resynchronized',
        message: `${error.message} A full synchronization will regenerate the cache.`,
      });
    } else {
      throw error;
    }
  }

  const access = await input.provider.checkAccess();
  if (!access.ok) return providerFailure(access.error, input.provider, cacheWarnings);
  const owner = {
    provider: 'github',
    providerId: access.value.ownerProviderId,
    login: access.value.login,
  };
  if (
    previous !== null &&
    (previous.owner.provider !== owner.provider || previous.owner.providerId !== owner.providerId)
  ) {
    return failed(
      3,
      'The cache belongs to a different provider account.',
      'cache_owner_mismatch',
      `The cache belongs to ${previous.owner.login} (${previous.owner.providerId}), not ${owner.login} (${owner.providerId}).`,
    );
  }

  const discovered: DiscoveredRepository[] = [];
  const discoveryErrors: ErrorDiagnostic[] = [];
  for await (const result of input.provider.discover(input.filter)) {
    if (result.ok) discovered.push(result.value);
    else {
      discoveryErrors.push(toErrorDiagnostic(result.error));
      break;
    }
  }
  if (discoveryErrors.length > 0) {
    return {
      outcome: {
        kind: discovered.length > 0 ? 'partial' : 'failed',
        ...(discovered.length === 0 ? { exitCode: exitCodeFor(discoveryErrors[0]?.code) } : {}),
      } as CommandResult['outcome'],
      summary: 'Repository discovery was incomplete; the existing cache was preserved.',
      data: {
        discoveredRepositories: discovered.length,
        cacheWritePerformed: false,
        requestUsage: input.provider.usage(),
      },
      errors: discoveryErrors,
      ...(cacheWarnings.length === 0 ? {} : { warnings: cacheWarnings }),
    };
  }

  const previousById = new Map(
    (previous?.projects ?? []).map((cached) => [
      cached.project.repository.identity.providerId,
      cached,
    ]),
  );
  const collected = await mapConcurrent(
    discovered,
    async (target) => {
      const prior = previousById.get(target.repository.identity.providerId);
      const result = await input.provider.collect(target, input.profile, {
        etags: Object.fromEntries(
          (prior?.resources ?? [])
            .filter((resource) => resource.etag !== null)
            .map((resource) => [resource.key, resource.etag as string]),
        ),
        ...(prior === undefined ? {} : { previous: toCollectionResult(prior) }),
      });
      return { target, result };
    },
    { limit: input.concurrency },
  );

  const observed: CachedProject[] = [];
  const failedIdentities: ProjectIdentity[] = [];
  const errors: ErrorDiagnostic[] = [];
  for (const [index, settled] of collected.results.entries()) {
    const target = discovered[index];
    if (target === undefined) continue;
    if (settled.status === 'fulfilled') {
      if (settled.value.result.ok) {
        const result = settled.value.result.value;
        const prior = previousById.get(target.repository.identity.providerId);
        observed.push({
          project: toProject(result, prior?.project.portfolio),
          resources: result.resources,
          diagnostics: result.diagnostics,
          partial: result.diagnostics.length > 0,
        });
      } else {
        failedIdentities.push(target.repository.identity);
        errors.push(toErrorDiagnostic(settled.value.result.error));
      }
    } else {
      failedIdentities.push(target.repository.identity);
      errors.push({
        code: 'repository_collection_failed',
        message: `Could not collect ${target.repository.slug}.`,
        retryable: true,
      });
    }
  }

  const reconciliation = reconcileProjects(previous?.projects ?? [], observed, failedIdentities);
  const failedById = new Map(
    failedIdentities.map((identity, index) => [identity.providerId, errors[index]]),
  );
  const next = reconciliation.next.map((cached) => {
    const failure = failedById.get(cached.project.repository.identity.providerId);
    if (failure === undefined) return cached;
    return {
      ...cached,
      diagnostics: [
        ...cached.diagnostics.filter((diagnostic) => diagnostic.code !== failure.code),
        {
          code: failure.code,
          message: failure.message,
          resource: cached.project.repository.webUrl,
          detail: null,
          retryable: failure.retryable,
        },
      ],
      partial: true,
    };
  });
  await input.cache.write({
    owner,
    synchronizedAt: errors.length === 0 ? input.synchronizedAt : (previous?.synchronizedAt ?? null),
    projects: next,
  });
  const counts = countChanges(reconciliation.changes);
  return {
    outcome: { kind: errors.length === 0 ? 'succeeded' : 'partial' },
    summary:
      errors.length === 0
        ? `Synchronized ${String(next.length)} repositories.`
        : `Synchronized ${String(observed.length)} repositories with ${String(errors.length)} failures.`,
    data: {
      discoveredRepositories: discovered.length,
      cachedRepositories: next.length,
      cacheWritePerformed: true,
      changes: counts,
      requestUsage: input.provider.usage(),
    },
    ...(errors.length === 0 ? {} : { errors }),
    ...(cacheWarnings.length === 0 ? {} : { warnings: cacheWarnings }),
  };
}

function toProject(result: CollectionResult, portfolio: Project['portfolio'] | undefined): Project {
  return projectSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    ...result,
    portfolio: portfolio ?? emptyPortfolio(),
  });
}

function toCollectionResult(cached: CachedProject): CollectionResult {
  return {
    repository: cached.project.repository,
    technology: cached.project.technology,
    statistics: cached.project.statistics,
    branches: cached.project.branches,
    tags: cached.project.tags,
    releases: cached.project.releases,
    contributors: cached.project.contributors,
    diagnostics: cached.project.diagnostics,
    resources: cached.resources,
  };
}

function emptyPortfolio(): Project['portfolio'] {
  return {
    featured: false,
    hidden: false,
    displayName: null,
    summary: null,
    category: null,
    status: null,
    displayOrder: null,
    technologies: [],
    demoUrl: null,
    documentationUrl: null,
    screenshots: [],
    businessRelevance: null,
    personalContribution: null,
    startedAt: null,
    endedAt: null,
    notes: null,
  };
}

function countChanges(
  changes: ReturnType<typeof reconcileProjects>['changes'],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const change of changes) counts[change.kind] = (counts[change.kind] ?? 0) + 1;
  return counts;
}

function providerFailure(
  error: Parameters<typeof toErrorDiagnostic>[0],
  provider: RepositoryProvider,
  warnings: readonly Diagnostic[],
): CommandResult {
  return {
    outcome: { kind: 'failed', exitCode: exitCodeFor(error.code) },
    summary: 'Repository synchronization failed before collection.',
    data: { cacheWritePerformed: false, requestUsage: provider.usage() },
    errors: [toErrorDiagnostic(error)],
    ...(warnings.length === 0 ? {} : { warnings }),
  };
}

function toErrorDiagnostic(error: {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly subject?: string | null;
}): ErrorDiagnostic {
  return {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    ...(error.subject === undefined || error.subject === null ? {} : { subject: error.subject }),
  };
}

function failed(exitCode: 2 | 3, summary: string, code: string, message: string): CommandResult {
  return {
    outcome: { kind: 'failed', exitCode },
    summary,
    data: { cacheWritePerformed: false },
    errors: [{ code, message, retryable: false }],
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
