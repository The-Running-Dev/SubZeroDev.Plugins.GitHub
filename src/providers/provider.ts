import type { Repository } from '../models/repository.js';

import type { Outcome, ProviderError } from './outcome.js';

export type CollectionProfile = 'basic' | 'standard' | 'detailed';

/**
 * Mirrors `configuration.repositories`. Exclusion means the repository is not
 * *collected* — not merely hidden from output — because collecting costs API budget
 * either way.
 */
export interface RepositoryFilter {
  readonly includeForks: boolean;
  readonly includeArchived: boolean;
  readonly includeTemplates: boolean;
  readonly includeDisabled: boolean;
  readonly includePrivate: boolean;
  readonly includePublic: boolean;
  readonly includeSlugs: readonly string[];
  readonly excludeSlugs: readonly string[];
}

export interface ProviderAccess {
  readonly login: string;
  readonly ownerProviderId: string;
  /** Reported, never the value. Lets `validate` say where the token came from. */
  readonly tokenSource: 'environment' | 'gh-cli';
}

export interface ResourceConditions {
  readonly etags: Readonly<Record<string, string>>;
}

export interface DiscoveredRepository {
  readonly repository: Repository;
}

export interface CollectionResult {
  readonly repository: Repository;
  readonly diagnostics: readonly string[];
}

export interface RequestUsage {
  readonly primaryRequests: number;
  readonly searchRequests: number;
  /**
   * Counted separately because a `304` costs no primary quota. Conflating the two
   * makes an unchanged resync look as expensive as a full one, which is the whole
   * property conditional requests exist to deliver.
   */
  readonly notModifiedResponses: number;
  readonly retries: number;
}

export interface RepositoryProvider {
  checkAccess(): Promise<Outcome<ProviderAccess, ProviderError>>;
  discover(filter: RepositoryFilter): AsyncIterable<Outcome<DiscoveredRepository, ProviderError>>;
  /**
   * `Outcome`, like the other two. A bare `CollectionResult` would leave a provider
   * no way to report failure except by throwing, and a throw from inside the
   * per-repository loop aborts the whole run — the exact opposite of the
   * partial-success requirement, where one repository failing must leave the rest
   * collected and exit `4`.
   *
   * Note the two distinct failure levels: an `ok: false` here is "this repository
   * could not be collected at all", whereas a successful `CollectionResult` may still
   * carry `diagnostics` for individual resources that were unavailable.
   */
  collect(
    target: DiscoveredRepository,
    profile: CollectionProfile,
    conditions: ResourceConditions,
  ): Promise<Outcome<CollectionResult, ProviderError>>;
  usage(): RequestUsage;
}
