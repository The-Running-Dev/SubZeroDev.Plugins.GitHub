/** Stable cache keys for conditional GitHub resources. */
export type ResourceKey =
  | 'authenticated-user'
  | 'owned-repositories'
  | `repository:${string}`
  | `repository-languages:${string}`
  | `repository-releases:${string}`
  | `repository-latest-release:${string}`
  | `repository-branches:${string}`
  | `repository-tags:${string}`
  | `repository-contributors:${string}`
  | `repository-commits:${string}`
  | `repository-statistics:${string}`
  | `search:${string}`;

export function repositoryResourceKey(providerId: string): ResourceKey {
  return `repository:${providerId}`;
}

export function searchResourceKey(providerId: string, qualifiers: string): ResourceKey {
  return `search:${providerId}:${qualifiers}`;
}
