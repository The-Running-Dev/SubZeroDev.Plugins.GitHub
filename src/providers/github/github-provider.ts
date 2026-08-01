import type { ResolvedToken } from '../../configuration/environment.js';
import type { Logger } from '../../logging/logger.js';
import type { Clock, Sleeper } from '../../services/ports.js';
import type { Diagnostic } from '../../models/diagnostics.js';
import type {
  CollectionProfile,
  CollectionResult,
  DiscoveredRepository,
  ProviderAccess,
  RepositoryFilter,
  RepositoryProvider,
  RequestUsage,
  ResourceConditions,
} from '../provider.js';
import type { Outcome, ProviderError } from '../outcome.js';

import { createGitHubClient, type GitHubClient } from './client.js';
import { discoverOwnedRepositories, githubUserSchema } from './discovery.js';
import { providerError } from './errors.js';
import { mapCoreMetadata, mapRepository, type GitHubCoreMetadata } from './mapping/repository.js';
import type { RequestBudget } from './rate-limit.js';
import { githubUrl } from './urls.js';
import { collectLanguages } from './collect/languages.js';
import { collectReleases } from './collect/releases.js';
import { collectPageCount } from './collect/counts.js';
import { collectContributors } from './collect/contributors.js';
import { collectIssueAndPullRequestCounts } from './collect/search.js';
import { collectBranches } from './collect/branches.js';
import { collectTags } from './collect/tags.js';

export interface CreateGitHubProviderOptions {
  readonly token: ResolvedToken;
  readonly logger: Logger;
  readonly sleeper: Sleeper;
  readonly clock: Clock;
  readonly budget: RequestBudget;
  readonly userAgent: string;
  readonly documentationUrlTemplate?: string | null;
  readonly fetch?: typeof globalThis.fetch;
  readonly random?: () => number;
  readonly baseUrl?: string;
  readonly searchRequestsPerMinute?: number;
}

export class GitHubProvider implements RepositoryProvider {
  private readonly client: GitHubClient;
  private readonly documentationUrlTemplate: string | null;
  private readonly token: ResolvedToken;
  private readonly coreMetadata = new Map<string, GitHubCoreMetadata>();

  public constructor(options: CreateGitHubProviderOptions) {
    this.client = createGitHubClient(options);
    this.documentationUrlTemplate = options.documentationUrlTemplate ?? null;
    this.token = options.token;
  }

  public async checkAccess(): Promise<Outcome<ProviderAccess, ProviderError>> {
    const url = githubUrl(this.client.baseUrl, 'user');
    const response = await this.client.requester.get(
      { resource: 'authenticated-user', url: url.toString(), bucket: 'core' },
      (value) => githubUserSchema.parse(value),
    );
    if (!response.ok) return response;
    if (response.value.data === null) {
      return {
        ok: false,
        error: providerError(
          'response-shape',
          'github_user_not_available',
          'GitHub did not return an authenticated user.',
        ),
      };
    }
    return {
      ok: true,
      value: {
        login: response.value.data.login,
        ownerProviderId: String(response.value.data.id),
        tokenSource: this.token.source,
      },
    };
  }

  public async *discover(
    filter: RepositoryFilter,
  ): AsyncIterable<Outcome<DiscoveredRepository, ProviderError>> {
    for await (const result of discoverOwnedRepositories(this.client, filter)) {
      if (!result.ok) {
        yield result;
        return;
      }
      const repository = mapRepository(result.value, {
        documentationUrlTemplate: this.documentationUrlTemplate,
      });
      this.coreMetadata.set(repository.identity.providerId, mapCoreMetadata(result.value));
      yield {
        ok: true,
        value: {
          repository,
        },
      };
    }
  }

  public async collect(
    target: DiscoveredRepository,
    profile: CollectionProfile,
    conditions: ResourceConditions,
  ): Promise<Outcome<CollectionResult, ProviderError>> {
    const context = { client: this.client, target, conditions };
    const metadata = this.coreMetadata.get(target.repository.identity.providerId) ?? {
      sizeKilobytes: null,
      stars: null,
      forks: null,
      watchers: null,
      reportedOpenIssuesAndPullRequests: null,
    };
    const diagnostics = coreDiagnostics(target, metadata);

    if (profile === 'basic') {
      return {
        ok: true,
        value: baseCollection(target, metadata, diagnostics),
      };
    }

    const [languages, releases, branches, tags] = await Promise.all([
      collectLanguages(context),
      collectReleases(context),
      collectBranches(context),
      collectTags(context),
    ]);
    const previous = conditions.previous ?? null;
    const languageValue = reuseNotModified(languages, previous?.technology.languages ?? null);
    const releaseValue = reuseNotModified(releases, previous?.releases ?? null);
    const branchValue = reuseNotModified(branches, previous?.branches ?? null);
    const tagValue = reuseNotModified(tags, previous?.tags ?? null);
    diagnostics.push(
      ...withoutNotModifiedDiagnostic(languages.diagnostics, languageValue.reused),
      ...withoutNotModifiedDiagnostic(releases.diagnostics, releaseValue.reused),
      ...withoutNotModifiedDiagnostic(branches.diagnostics, branchValue.reused),
      ...withoutNotModifiedDiagnostic(tags.diagnostics, tagValue.reused),
    );

    let commits: number | null = null;
    let contributors: CollectionResult['contributors'] = {
      total: null,
      truncated: false,
      contributors: [],
    };
    let issues: CollectionResult['statistics']['issues'] = { open: null, closed: null };
    let pullRequests: CollectionResult['statistics']['pullRequests'] = {
      open: null,
      closed: null,
    };
    if (profile === 'detailed') {
      const [contributorResult, commitResult, issueResult] = await Promise.all([
        collectContributors(context),
        collectPageCount(context, {
          suffix: 'commits',
          resource: `repository-commits:${target.repository.identity.providerId}`,
          emptyMeaning: 'unavailable',
        }),
        collectIssueAndPullRequestCounts(context, metadata.reportedOpenIssuesAndPullRequests),
      ]);
      const contributorValue = reuseNotModified(contributorResult, previous?.contributors ?? null);
      const commitValue = reuseNotModified(commitResult, previous?.statistics.commits ?? null);
      contributors = contributorValue.value ?? contributors;
      commits = commitValue.value;
      if (issueResult.value !== null) {
        issues = issueResult.value.issues;
        pullRequests = issueResult.value.pullRequests;
      }
      diagnostics.push(
        ...withoutNotModifiedDiagnostic(contributorResult.diagnostics, contributorValue.reused),
        ...withoutNotModifiedDiagnostic(commitResult.diagnostics, commitValue.reused),
        ...issueResult.diagnostics,
      );
    }

    return {
      ok: true,
      value: {
        repository: target.repository,
        technology: {
          primaryLanguage: target.repository.primaryLanguage,
          languages: [...(languageValue.value ?? [])],
        },
        statistics: {
          sizeKilobytes: metadata.sizeKilobytes,
          stars: metadata.stars,
          forks: metadata.forks,
          watchers: metadata.watchers,
          commits,
          issues,
          pullRequests,
        },
        branches: branchValue.value ?? { total: null, branches: [] },
        tags: tagValue.value ?? { total: null, latest: null },
        releases: releaseValue.value ?? { total: null, latest: null },
        contributors,
        diagnostics,
        resources: this.client.requester.observationsForSubject(target.repository.slug),
      },
    };
  }

  public usage(): RequestUsage {
    return this.client.requester.usage();
  }

  public rawResponses() {
    return this.client.requester.rawResponses();
  }
}

function baseCollection(
  target: DiscoveredRepository,
  metadata: GitHubCoreMetadata,
  diagnostics: readonly Diagnostic[],
): CollectionResult {
  return {
    repository: target.repository,
    technology: { primaryLanguage: target.repository.primaryLanguage, languages: [] },
    statistics: {
      sizeKilobytes: metadata.sizeKilobytes,
      stars: metadata.stars,
      forks: metadata.forks,
      watchers: metadata.watchers,
      commits: null,
      issues: { open: null, closed: null },
      pullRequests: { open: null, closed: null },
    },
    branches: { total: null, branches: [] },
    tags: { total: null, latest: null },
    releases: { total: null, latest: null },
    contributors: { total: null, truncated: false, contributors: [] },
    diagnostics: [...diagnostics],
    resources: [],
  };
}

function reuseNotModified<T>(
  result: { readonly value: T | null; readonly diagnostics: readonly Diagnostic[] },
  previous: T | null,
): { readonly value: T | null; readonly reused: boolean } {
  const notModified = result.diagnostics.some(
    (diagnostic) => diagnostic.code === 'github_not_modified_without_cache',
  );
  return notModified && previous !== null
    ? { value: previous, reused: true }
    : { value: result.value, reused: false };
}

function withoutNotModifiedDiagnostic(
  diagnostics: readonly Diagnostic[],
  reused: boolean,
): readonly Diagnostic[] {
  return reused
    ? diagnostics.filter((diagnostic) => diagnostic.code !== 'github_not_modified_without_cache')
    : diagnostics;
}

function coreDiagnostics(target: DiscoveredRepository, metadata: GitHubCoreMetadata): Diagnostic[] {
  return Object.entries(metadata)
    .filter(([name, value]) => name !== 'reportedOpenIssuesAndPullRequests' && value === null)
    .map(([name]) => ({
      code: 'github_core_statistic_unavailable',
      message: `GitHub did not provide the core statistic ${name}.`,
      resource: target.repository.webUrl,
      detail: name,
      retryable: false,
    }));
}
