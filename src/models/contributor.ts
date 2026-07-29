import { z } from 'zod';

import {
  nonEmptyStringSchema,
  nullableNonNegativeIntegerSchema,
  nullableStringSchema,
  nullableUrlSchema,
  nonNegativeIntegerSchema,
} from './primitives.js';

export const contributorSchema = z.object({
  login: nonEmptyStringSchema,
  contributions: nonNegativeIntegerSchema,
  profileUrl: nullableUrlSchema,
  accountType: nullableStringSchema,
});

export const contributorSummarySchema = z.object({
  total: nullableNonNegativeIntegerSchema,
  truncated: z.boolean(),
  contributors: z.array(contributorSchema),
});

export type Contributor = z.infer<typeof contributorSchema>;
export type ContributorSummary = z.infer<typeof contributorSummarySchema>;
