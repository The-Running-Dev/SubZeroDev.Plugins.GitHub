import { z } from 'zod';

import { nonEmptyStringSchema, nullableStringSchema } from './primitives.js';

export const branchSchema = z.object({
  name: nonEmptyStringSchema,
  isDefault: z.boolean(),
  protected: z.boolean().nullable(),
  lastCommitSha: nullableStringSchema,
});

export const branchSummarySchema = z.object({
  total: z.number().int().min(0).nullable(),
  branches: z.array(branchSchema),
});

export type Branch = z.infer<typeof branchSchema>;
export type BranchSummary = z.infer<typeof branchSummarySchema>;
