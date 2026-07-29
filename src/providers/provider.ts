import type { Repository } from '../models/repository.js';

import type { Outcome, ProviderError } from './outcome.js';

export type CollectionProfile = 'basic' | 'standard' | 'detailed';
export interface RepositoryFilter {
  readonly includeForks: boolean;
}
export interface ProviderAccess {
  readonly login: string;
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
}

export interface RepositoryProvider {
  checkAccess(): Promise<Outcome<ProviderAccess, ProviderError>>;
  discover(filter: RepositoryFilter): AsyncIterable<Outcome<DiscoveredRepository, ProviderError>>;
  collect(
    target: DiscoveredRepository,
    profile: CollectionProfile,
    conditions: ResourceConditions,
  ): Promise<CollectionResult>;
  usage(): RequestUsage;
}
