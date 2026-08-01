import type { DiscoveredRepository, ResourceConditions } from '../../provider.js';
import type { GitHubClient } from '../client.js';
import { githubUrl } from '../urls.js';

export interface CollectorContext {
  readonly client: GitHubClient;
  readonly target: DiscoveredRepository;
  readonly conditions: ResourceConditions;
}

export function repositoryEndpoint(
  context: CollectorContext,
  suffix: string,
  parameters: Readonly<Record<string, string>> = {},
): URL {
  const { owner, name } = context.target.repository;
  return githubUrl(
    context.client.baseUrl,
    `repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${suffix}`,
    parameters,
  );
}

export function conditionFor(context: CollectorContext, resource: string): string | null {
  return context.conditions.etags[resource] ?? null;
}
