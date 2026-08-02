import { z } from 'zod';

import { nullableNonNegativeIntegerSchema, nullableStringSchema } from './primitives.js';

export const tagSummarySchema = z.object({
  total: nullableNonNegativeIntegerSchema,
  latest: nullableStringSchema,
});

export type TagSummary = z.infer<typeof tagSummarySchema>;
