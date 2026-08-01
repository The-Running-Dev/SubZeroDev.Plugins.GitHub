import { z } from 'zod';

import {
  distributeLanguagePercentages,
  type LanguageStatistics,
} from '../../../models/language.js';
import type { ResourceKey } from '../resource-keys.js';

import type { CollectorContext } from './shared.js';
import { conditionFor, repositoryEndpoint } from './shared.js';
import { collected, type CollectorResult, unavailable, unavailableFromError } from './result.js';

const languageBytesSchema = z.record(z.string().min(1), z.number().int().nonnegative());

export async function collectLanguages(
  context: CollectorContext,
): Promise<CollectorResult<readonly LanguageStatistics[]>> {
  const resource: ResourceKey = `repository-languages:${context.target.repository.identity.providerId}`;
  const url = repositoryEndpoint(context, 'languages').toString();
  const response = await context.client.requester.get(
    {
      resource,
      url,
      bucket: 'core',
      etag: conditionFor(context, resource),
      acceptNotModified: true,
      subject: context.target.repository.slug,
    },
    (value) => languageBytesSchema.parse(value),
  );
  if (!response.ok) return unavailableFromError(response.error, url);
  if (response.value.notModified)
    return unavailable(
      'github_not_modified_without_cache',
      'GitHub reported unchanged languages, but no cached value was supplied.',
      url,
    );
  if (response.value.data === null)
    return unavailable('github_languages_unavailable', 'GitHub returned no language data.', url);

  return collected(
    distributeLanguagePercentages(
      Object.entries(response.value.data).map(([name, bytes]) => ({ name, bytes })),
    ),
  );
}
