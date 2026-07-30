import { z } from 'zod';

import type { Outcome, ProviderError } from '../outcome.js';
import type { RepositoryFilter } from '../provider.js';

import type { GitHubClient } from './client.js';
import { providerError } from './errors.js';
import { githubRepositorySchema, type GitHubRepository } from './mapping/repository.js';

const repositoryPageSchema = z.array(githubRepositorySchema);

/** GitHub's maximum. A short page therefore means the last page. */
const PER_PAGE = 100;

export const githubUserSchema = z.object({
  login: z.string().min(1),
  id: z.number().int().nonnegative(),
});

export async function* discoverOwnedRepositories(
  client: GitHubClient,
  filter: RepositoryFilter,
): AsyncIterable<Outcome<GitHubRepository, ProviderError>> {
  // Pagination is not a snapshot: a repository created, renamed, or transferred while
  // the walk is in flight shifts across the `full_name` ordering and can arrive on two
  // pages. Keyed on the immutable numeric ID — never the slug — so "discovered exactly
  // once" holds without depending on GitHub holding still. A duplicate reaching the
  // documents would fail the duplicate-ID check at validation, turning a benign race
  // into a failed run.
  const seen = new Set<number>();

  for (let page = 1; ; page += 1) {
    const url = new URL('/user/repos', client.baseUrl);
    url.searchParams.set('affiliation', 'owner');
    url.searchParams.set('per_page', String(PER_PAGE));
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
    if (response.value.data === null) {
      // `data` is nullable for every caller because a `304` carries no body, and this
      // request neither sends an ETag nor accepts a not-modified response — a `202` is
      // already a `not-settled` error by the time it gets here, and an empty body fails
      // the array parse. So this is a guard the type requires rather than one GitHub is
      // expected to trip; what matters is which way it fails. `?? []` would end the walk
      // reporting success with a silently truncated account.
      yield {
        ok: false,
        error: providerError(
          'response-shape',
          'github_repository_page_missing',
          `GitHub returned HTTP ${String(response.value.status)} with no repository page.`,
          { status: response.value.status, retryable: false },
        ),
      };
      return;
    }

    const repositories = response.value.data;
    for (const repository of repositories) {
      if (seen.has(repository.id)) {
        client.logger.debug('Skipping a repository GitHub returned on two pages.', {
          providerId: String(repository.id),
          page,
        });
        continue;
      }
      seen.add(repository.id);
      if (matchesFilter(repository, filter)) yield { ok: true, value: repository };
    }
    if (repositories.length < PER_PAGE) return;
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

/**
 * Case-insensitive, because GitHub resolves `owner/name` case-insensitively: a filter
 * of `subzerodev/*` against the owner `SubZeroDev` must not silently collect nothing.
 * `toLowerCase` rather than `toLocaleLowerCase` — a filter's meaning must not depend on
 * the environment's locale, for the same reason ordering never uses `localeCompare`.
 */
function globMatches(pattern: string, candidate: string): boolean {
  const escaped = pattern
    .toLowerCase()
    .replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    .replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`).test(candidate.toLowerCase());
}
