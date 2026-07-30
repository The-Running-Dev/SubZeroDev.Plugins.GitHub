import type { ResolvedToken } from '../../configuration/environment.js';
import type { Logger } from '../../logging/logger.js';
import type { Clock, Sleeper } from '../../services/ports.js';
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
import { mapRepository } from './mapping/repository.js';
import type { RequestBudget } from './rate-limit.js';
import { githubUrl } from './urls.js';

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
}

export class GitHubProvider implements RepositoryProvider {
  private readonly client: GitHubClient;
  private readonly documentationUrlTemplate: string | null;
  private readonly token: ResolvedToken;

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
      yield {
        ok: true,
        value: {
          repository: mapRepository(result.value, {
            documentationUrlTemplate: this.documentationUrlTemplate,
          }),
        },
      };
    }
  }

  /**
   * Milestone 3 discovers and maps; per-repository collection is Milestone 4. Returning
   * `ok` with an empty `diagnostics` would be indistinguishable from a real collection,
   * so what is *not* collected is stated explicitly — Milestone 3.5 wires `sync` against
   * this method, and a stub that reports silent success is one a caller believes.
   */
  public collect(
    target: DiscoveredRepository,
    profile: CollectionProfile,
    conditions: ResourceConditions,
  ): Promise<Outcome<CollectionResult, ProviderError>> {
    const diagnostics = [
      `collection_not_implemented: the ${profile} profile collects nothing beyond core discovery metadata before Milestone 4.`,
    ];
    if (Object.keys(conditions.etags).length > 0) {
      diagnostics.push(
        'conditional_requests_not_implemented: supplied ETags were not sent; conditional collection lands with the cache in Milestone 5.',
      );
    }
    return Promise.resolve({ ok: true, value: { repository: target.repository, diagnostics } });
  }

  public usage(): RequestUsage {
    return this.client.requester.usage();
  }
}
