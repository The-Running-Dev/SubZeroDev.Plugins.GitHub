/** Stable cache keys for conditional GitHub resources. */
export type ResourceKey =
  | 'authenticated-user'
  | 'owned-repositories'
  | `repository:${string}`
  | `repository-languages:${string}`
  | `repository-statistics:${string}`
  | `search:${string}`;

export function repositoryResourceKey(providerId: string): ResourceKey {
  return `repository:${providerId}`;
}
