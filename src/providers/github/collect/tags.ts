import { z } from 'zod';

import { tagSummarySchema, type TagSummary } from '../../../models/tag.js';
import type { ResourceKey } from '../resource-keys.js';

import { collected, type CollectorResult, unavailable, unavailableFromError } from './result.js';
import type { CollectorContext } from './shared.js';
import { conditionFor, repositoryEndpoint } from './shared.js';

const githubTagSchema = z.object({ name: z.string().min(1) });

export async function collectTags(context: CollectorContext): Promise<CollectorResult<TagSummary>> {
  const resource: ResourceKey = `repository-tags:${context.target.repository.identity.providerId}`;
  const url = repositoryEndpoint(context, 'tags', { per_page: '1', page: '1' }).toString();
  const response = await context.client.requester.get(
    {
      resource,
      url,
      bucket: 'core',
      etag: conditionFor(context, resource),
      acceptNotModified: true,
      subject: context.target.repository.slug,
    },
    (value) => z.array(githubTagSchema).parse(value),
  );
  if (!response.ok) return unavailableFromError(response.error, url);
  if (response.value.notModified)
    return unavailable(
      'github_not_modified_without_cache',
      'GitHub reported unchanged tags, but no cached value was supplied.',
      url,
    );
  if (response.value.data === null)
    return unavailable('github_tags_unavailable', 'GitHub returned no tag data.', url);

  const latest = response.value.data[0];
  return collected(
    tagSummarySchema.parse({
      total: latest === undefined ? 0 : (response.value.linkLastPage ?? 1),
      latest: latest?.name ?? null,
    }),
  );
}
