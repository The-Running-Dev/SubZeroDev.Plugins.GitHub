import { z } from 'zod';

import { branchSummarySchema, type BranchSummary } from '../../../models/branch.js';
import { compareCodeUnits } from '../../../models/primitives.js';
import type { ResourceKey } from '../resource-keys.js';

import { collected, type CollectorResult, unavailable, unavailableFromError } from './result.js';
import type { CollectorContext } from './shared.js';
import { conditionFor, repositoryEndpoint } from './shared.js';

const MAXIMUM_PAGES = 25;
const PAGE_SIZE = 100;
const githubBranchSchema = z.object({
  name: z.string().min(1),
  protected: z
    .boolean()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  commit: z.object({ sha: z.string().min(1) }),
});

export async function collectBranches(
  context: CollectorContext,
): Promise<CollectorResult<BranchSummary>> {
  const resource: ResourceKey = `repository-branches:${context.target.repository.identity.providerId}`;
  const branches = new Map<string, z.infer<typeof githubBranchSchema>>();
  let lastPage: number | null = null;

  for (let page = 1; page <= MAXIMUM_PAGES; page += 1) {
    const url = repositoryEndpoint(context, 'branches', {
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
      (value) => z.array(githubBranchSchema).parse(value),
    );
    if (!response.ok) return unavailableFromError(response.error, url);
    if (response.value.notModified)
      return unavailable(
        'github_not_modified_without_cache',
        'GitHub reported unchanged branches, but no cached value was supplied.',
        url,
      );
    if (response.value.data === null)
      return unavailable('github_branches_unavailable', 'GitHub returned no branch data.', url);

    lastPage = response.value.linkLastPage ?? lastPage;
    if (lastPage !== null && lastPage > MAXIMUM_PAGES) {
      return unavailable(
        'github_branches_page_cap',
        `The repository exceeds the ${String(MAXIMUM_PAGES * PAGE_SIZE)}-branch collection cap.`,
        url,
      );
    }
    for (const branch of response.value.data) branches.set(branch.name, branch);

    const complete =
      response.value.data.length < PAGE_SIZE || (lastPage !== null && page >= lastPage);
    if (complete) {
      const values = [...branches.values()].sort((left, right) =>
        compareCodeUnits(left.name, right.name),
      );
      return collected(
        branchSummarySchema.parse({
          total: values.length,
          branches: values.map((branch) => ({
            name: branch.name,
            isDefault: branch.name === context.target.repository.defaultBranch,
            protected: branch.protected,
            lastCommitSha: branch.commit.sha,
          })),
        }),
      );
    }
  }

  const resourceUrl = repositoryEndpoint(context, 'branches').toString();
  return unavailable(
    'github_branches_page_cap',
    `The repository reached the ${String(MAXIMUM_PAGES * PAGE_SIZE)}-branch collection cap without a terminal page.`,
    resourceUrl,
  );
}
