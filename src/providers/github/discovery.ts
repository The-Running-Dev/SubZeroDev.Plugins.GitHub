import { z } from 'zod';

import type { Outcome, ProviderError } from '../outcome.js';
import type { RepositoryFilter } from '../provider.js';

import type { GitHubClient } from './client.js';
import { providerError } from './errors.js';
import { githubRepositorySchema, type GitHubRepository } from './mapping/repository.js';
import { githubUrl } from './urls.js';

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
  // Compiled once per run, not once per repository per pattern: this loop runs for every
  // repository GitHub returns, and the patterns cannot change while it does.
  const include = filter.includeSlugs.map(compileGlob);
  const exclude = filter.excludeSlugs.map(compileGlob);

  for (let page = 1; ; page += 1) {
    const url = githubUrl(client.baseUrl, 'user/repos', {
      affiliation: 'owner',
      per_page: String(PER_PAGE),
      page: String(page),
      sort: 'full_name',
      direction: 'asc',
    });
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
      if (matchesFilter(repository, filter, include, exclude))
        yield { ok: true, value: repository };
    }
    if (repositories.length < PER_PAGE) return;
  }
}

function matchesFilter(
  repository: GitHubRepository,
  filter: RepositoryFilter,
  include: readonly RegExp[],
  exclude: readonly RegExp[],
): boolean {
  if (repository.fork && !filter.includeForks) return false;
  if (repository.archived && !filter.includeArchived) return false;
  if (repository.is_template && !filter.includeTemplates) return false;
  if (repository.disabled && !filter.includeDisabled) return false;
  if (repository.private && !filter.includePrivate) return false;
  if (!repository.private && !filter.includePublic) return false;
  if (exclude.length === 0 && include.length === 0) return true;

  // Folded once per repository rather than once per pattern.
  const slug = repository.full_name.toLowerCase();
  if (exclude.some((pattern) => pattern.test(slug))) return false;
  return include.length === 0 || include.some((pattern) => pattern.test(slug));
}

/**
 * Case-insensitive, because GitHub resolves `owner/name` case-insensitively: a filter of
 * `subzerodev/*` against the owner `SubZeroDev` must not silently collect nothing. The
 * pattern is lowercased here and the candidate at the call site rather than using the `i`
 * flag, so the fold is `toLowerCase` and never `toLocaleLowerCase` — a filter's meaning must
 * not depend on the environment's locale, for the same reason ordering never uses
 * `localeCompare`.
 */
function compileGlob(pattern: string): RegExp {
  const escaped = pattern
    .toLowerCase()
    .replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    .replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`);
}
