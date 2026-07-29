import { z } from 'zod';

import { nonEmptyStringSchema, nullableStringSchema } from './primitives.js';

export const branchSchema = z.object({
  name: nonEmptyStringSchema,
  isDefault: z.boolean(),
  protected: z.boolean().nullable(),
  lastCommitSha: nullableStringSchema,
});

export type Branch = z.infer<typeof branchSchema>;
