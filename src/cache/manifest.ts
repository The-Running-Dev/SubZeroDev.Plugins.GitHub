import { z } from 'zod';

import { diagnosticSchema } from '../models/diagnostics.js';
import {
  nonEmptyStringSchema,
  providerIdSchema,
  providerSchema,
  nullableTimestampSchema,
  timestampSchema,
} from '../models/primitives.js';
import { schemaVersionSchema } from '../models/schema-version.js';

export const CACHE_VERSION = '1.0.0' as const;
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const cachedResourceSchema = z
  .object({
    key: nonEmptyStringSchema,
    etag: z.string().min(1).nullable(),
    fetchedAt: timestampSchema,
  })
  .strict();

export const cacheEntrySchema = z
  .object({
    providerId: providerIdSchema,
    slug: nonEmptyStringSchema,
    document: nonEmptyStringSchema,
    documentHash: digestSchema,
    contentHash: digestSchema,
    resources: z.array(cachedResourceSchema),
    diagnostics: z.array(diagnosticSchema),
    partial: z.boolean(),
  })
  .strict();

export const cacheManifestSchema = z
  .object({
    cacheVersion: z.literal(CACHE_VERSION),
    schemaVersion: schemaVersionSchema,
    owner: z
      .object({
        provider: providerSchema,
        providerId: providerIdSchema,
        login: nonEmptyStringSchema,
      })
      .strict(),
    lastCompleteSync: nullableTimestampSchema,
    repositories: z.array(cacheEntrySchema),
  })
  .strict();

export type CachedResource = z.infer<typeof cachedResourceSchema>;
export type CacheEntry = z.infer<typeof cacheEntrySchema>;
export type CacheManifest = z.infer<typeof cacheManifestSchema>;
