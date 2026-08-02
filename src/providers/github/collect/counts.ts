import { z } from 'zod';

import type { ResourceKey } from '../resource-keys.js';

import { collected, type CollectorResult, unavailable, unavailableFromError } from './result.js';
import type { CollectorContext } from './shared.js';
import { conditionFor, repositoryEndpoint } from './shared.js';

const itemSchema = z.object({}).loose();

export async function collectPageCount(
  context: CollectorContext,
  input: {
    readonly suffix: 'branches' | 'tags' | 'commits';
    readonly resource: ResourceKey;
    readonly emptyMeaning: 'zero' | 'unavailable';
  },
): Promise<CollectorResult<number>> {
  const url = repositoryEndpoint(context, input.suffix, { per_page: '1', page: '1' }).toString();
  const response = await context.client.requester.get(
    {
      resource: input.resource,
      url,
      bucket: 'core',
      etag: conditionFor(context, input.resource),
      acceptNotModified: true,
      subject: context.target.repository.slug,
    },
    (value) => z.array(itemSchema).parse(value),
  );
  if (!response.ok) return unavailableFromError(response.error, url);
  if (response.value.notModified)
    return unavailable(
      'github_not_modified_without_cache',
      `GitHub reported unchanged ${input.suffix}, but no cached value was supplied.`,
      url,
    );
  if (response.value.data === null)
    return unavailable(
      `github_${input.suffix}_unavailable`,
      `GitHub returned no ${input.suffix} data.`,
      url,
    );
  if (response.value.data.length === 0) {
    return input.emptyMeaning === 'zero'
      ? collected(0)
      : unavailable(
          `github_${input.suffix}_empty`,
          `GitHub returned no ${input.suffix}; the count is unavailable.`,
          url,
        );
  }
  return collected(response.value.linkLastPage ?? 1);
}
