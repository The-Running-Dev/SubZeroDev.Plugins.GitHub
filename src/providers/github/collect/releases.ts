import { z } from 'zod';

import { releaseSummarySchema, type ReleaseSummary } from '../../../models/release.js';
import { compareCodeUnits } from '../../../models/primitives.js';
import type { ResourceKey } from '../resource-keys.js';

import type { CollectorContext } from './shared.js';
import { conditionFor, repositoryEndpoint } from './shared.js';
import { collected, type CollectorResult, unavailable, unavailableFromError } from './result.js';

const releaseSchema = z.object({
  tag_name: z.string().min(1),
  name: z.string().nullable(),
  published_at: z.string().nullable(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  html_url: z.url().nullable(),
  assets: z.array(
    z.object({
      name: z.string().min(1),
      browser_download_url: z.url().nullable(),
      content_type: z.string().nullable(),
      size: z.number().int().nonnegative(),
      download_count: z.number().int().nonnegative().nullable(),
    }),
  ),
});

export async function collectReleases(
  context: CollectorContext,
): Promise<CollectorResult<ReleaseSummary>> {
  const providerId = context.target.repository.identity.providerId;
  const countResource: ResourceKey = `repository-releases:${providerId}`;
  const countUrl = repositoryEndpoint(context, 'releases', { per_page: '1', page: '1' }).toString();
  const countResponse = await context.client.requester.get(
    {
      resource: countResource,
      url: countUrl,
      bucket: 'core',
      etag: conditionFor(context, countResource),
      acceptNotModified: true,
      subject: context.target.repository.slug,
    },
    (value) => z.array(releaseSchema).parse(value),
  );
  if (!countResponse.ok) return unavailableFromError(countResponse.error, countUrl);
  if (countResponse.value.notModified)
    return unavailable(
      'github_not_modified_without_cache',
      'GitHub reported unchanged releases, but no cached value was supplied.',
      countUrl,
    );
  if (countResponse.value.data === null)
    return unavailable('github_releases_unavailable', 'GitHub returned no release data.', countUrl);

  const count = countResponse.value.data.length === 0 ? 0 : (countResponse.value.linkLastPage ?? 1);
  if (count === 0) return collected(releaseSummarySchema.parse({ total: 0, latest: null }));

  const latestResource: ResourceKey = `repository-latest-release:${providerId}`;
  const latestUrl = repositoryEndpoint(context, 'releases/latest').toString();
  const latestResponse = await context.client.requester.get(
    {
      resource: latestResource,
      url: latestUrl,
      bucket: 'core',
      etag: conditionFor(context, latestResource),
      acceptNotModified: true,
      subject: context.target.repository.slug,
    },
    (value) => releaseSchema.parse(value),
  );
  if (!latestResponse.ok) {
    if (latestResponse.error.kind === 'not-found') {
      return collected(releaseSummarySchema.parse({ total: count, latest: null }));
    }
    return {
      value: releaseSummarySchema.parse({ total: count, latest: null }),
      diagnostics: unavailableFromError<ReleaseSummary>(latestResponse.error, latestUrl)
        .diagnostics,
    };
  }
  if (latestResponse.value.notModified)
    return unavailable(
      'github_not_modified_without_cache',
      'GitHub reported an unchanged latest release, but no cached value was supplied.',
      latestUrl,
    );
  if (latestResponse.value.data === null)
    return unavailable(
      'github_latest_release_unavailable',
      'GitHub returned no latest release data.',
      latestUrl,
    );

  const latest = latestResponse.value.data;
  return collected(
    releaseSummarySchema.parse({
      total: count,
      latest: {
        tagName: latest.tag_name,
        name: latest.name,
        publishedAt: normalizeTimestamp(latest.published_at),
        isDraft: latest.draft,
        isPrerelease: latest.prerelease,
        url: latest.html_url,
        assets: [...latest.assets]
          .sort((left, right) => compareCodeUnits(left.name, right.name))
          .map((asset) => ({
            name: asset.name,
            downloadUrl: asset.browser_download_url,
            contentType: asset.content_type,
            size: asset.size,
            downloadCount: asset.download_count,
          })),
      },
    }),
  );
}

function normalizeTimestamp(value: string | null): string | null {
  if (value === null) return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}
