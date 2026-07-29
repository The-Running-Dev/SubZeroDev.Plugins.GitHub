import { z } from 'zod';

import {
  nonEmptyStringSchema,
  nullableNonNegativeIntegerSchema,
  nullableStringSchema,
  nullableTimestampSchema,
  nullableUrlSchema,
  nonNegativeIntegerSchema,
} from './primitives.js';

export const releaseAssetSchema = z.object({
  name: nonEmptyStringSchema,
  downloadUrl: nullableUrlSchema,
  contentType: nullableStringSchema,
  size: nonNegativeIntegerSchema,
  downloadCount: nullableNonNegativeIntegerSchema,
});

export const releaseSchema = z.object({
  tagName: nonEmptyStringSchema,
  name: nullableStringSchema,
  publishedAt: nullableTimestampSchema,
  isDraft: z.boolean(),
  isPrerelease: z.boolean(),
  url: nullableUrlSchema,
  assets: z.array(releaseAssetSchema),
});

export const releaseSummarySchema = z.object({
  total: nullableNonNegativeIntegerSchema,
  latest: releaseSchema.nullable(),
});

export type ReleaseAsset = z.infer<typeof releaseAssetSchema>;
export type Release = z.infer<typeof releaseSchema>;
export type ReleaseSummary = z.infer<typeof releaseSummarySchema>;
