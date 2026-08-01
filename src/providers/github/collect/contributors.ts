import { z } from 'zod';

import { contributorSummarySchema, type ContributorSummary } from '../../../models/contributor.js';
import { compareCodeUnits } from '../../../models/primitives.js';
import type { ResourceKey } from '../resource-keys.js';

import { collected, type CollectorResult, unavailable, unavailableFromError } from './result.js';
import type { CollectorContext } from './shared.js';
import { conditionFor, repositoryEndpoint } from './shared.js';

const MAXIMUM_PAGES = 5;
const PAGE_SIZE = 100;
const contributorSchema = z.object({
  login: z.string().min(1),
  contributions: z.number().int().nonnegative(),
  html_url: z.url().nullable(),
  type: z.string().nullable(),
});

export async function collectContributors(
  context: CollectorContext,
): Promise<CollectorResult<ContributorSummary>> {
  const resource: ResourceKey = `repository-contributors:${context.target.repository.identity.providerId}`;
  const contributors = new Map<string, z.infer<typeof contributorSchema>>();
  let reportedLastPage: number | null = null;

  for (let page = 1; page <= MAXIMUM_PAGES; page += 1) {
    const url = repositoryEndpoint(context, 'contributors', {
      per_page: String(PAGE_SIZE),
      page: String(page),
    }).toString();
    const response = await context.client.requester.get(
      {
        resource,
        url,
        bucket: 'core',
        ...(page === 1 ? { etag: conditionFor(context, resource), acceptNotModified: true } : {}),
        subject: context.target.repository.slug,
      },
      (value) => z.array(contributorSchema).parse(value),
    );
    if (!response.ok) return unavailableFromError(response.error, url);
    if (response.value.notModified)
      return unavailable(
        'github_not_modified_without_cache',
        'GitHub reported unchanged contributors, but no cached value was supplied.',
        url,
      );
    if (response.value.data === null)
      return unavailable(
        'github_contributors_unavailable',
        'GitHub returned no contributor data.',
        url,
      );

    reportedLastPage = response.value.linkLastPage ?? reportedLastPage;
    for (const contributor of response.value.data) contributors.set(contributor.login, contributor);
    if (response.value.data.length < PAGE_SIZE) break;
    if (reportedLastPage !== null && page >= reportedLastPage) break;
  }

  const values = [...contributors.values()].sort((left, right) =>
    compareCodeUnits(left.login, right.login),
  );
  return collected(
    contributorSummarySchema.parse({
      total: values.length,
      truncated:
        values.length >= MAXIMUM_PAGES * PAGE_SIZE ||
        (reportedLastPage !== null && reportedLastPage > MAXIMUM_PAGES),
      contributors: values.map((contributor) => ({
        login: contributor.login,
        contributions: contributor.contributions,
        profileUrl: contributor.html_url,
        accountType: contributor.type,
      })),
    }),
  );
}
