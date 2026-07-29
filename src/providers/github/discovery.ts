import { z } from 'zod';

import type { RepositoryFilter } from '../provider.js';

import type { GitHubClient } from './client.js';
import { githubRepositorySchema, type GitHubRepository } from './mapping/repository.js';

const repositoryPageSchema = z.array(githubRepositorySchema);

export const githubUserSchema = z.object({
  login: z.string().min(1),
  id: z.number().int().nonnegative(),
});

export async function* discoverOwnedRepositories(
  client: GitHubClient,
  filter: RepositoryFilter,
): AsyncIterable<
  | { readonly ok: true; readonly value: GitHubRepository }
  | { readonly ok: false; readonly error: import('../outcome.js').ProviderError }
> {
  for (let page = 1; ; page += 1) {
    const url = new URL('/user/repos', client.baseUrl);
    url.searchParams.set('affiliation', 'owner');
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    url.searchParams.set('sort', 'full_name');
    url.searchParams.set('direction', 'asc');
    const response = await client.requester.get(
      { resource: 'owned-repositories', url: url.toString(), bucket: 'core' },
      (value) => repositoryPageSchema.parse(value),
    );
    if (!response.ok) {
      yield response;
      return;
    }
    const repositories = response.value.data ?? [];
    for (const repository of repositories) {
      if (matchesFilter(repository, filter)) yield { ok: true, value: repository };
    }
    if (repositories.length < 100) return;
  }
}

function matchesFilter(repository: GitHubRepository, filter: RepositoryFilter): boolean {
  if (repository.fork && !filter.includeForks) return false;
  if (repository.archived && !filter.includeArchived) return false;
  if (repository.is_template && !filter.includeTemplates) return false;
  if (repository.disabled && !filter.includeDisabled) return false;
  if (repository.private && !filter.includePrivate) return false;
  if (!repository.private && !filter.includePublic) return false;
  if (filter.excludeSlugs.some((pattern) => globMatches(pattern, repository.full_name)))
    return false;
  return (
    filter.includeSlugs.length === 0 ||
    filter.includeSlugs.some((pattern) => globMatches(pattern, repository.full_name))
  );
}

function globMatches(pattern: string, candidate: string): boolean {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`).test(candidate);
}
