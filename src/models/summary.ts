import { z } from 'zod';

import { projectIdentitySchema } from './identity.js';
import { languageStatisticsSchema } from './language.js';
import { nullableNonNegativeIntegerSchema } from './primitives.js';

export const summarySchema = z.object({
  total: z.number().int().min(0),
  public: z.number().int().min(0),
  private: z.number().int().min(0),
  archived: z.number().int().min(0),
  languages: z.array(languageStatisticsSchema),
  stars: nullableNonNegativeIntegerSchema,
  forks: nullableNonNegativeIntegerSchema,
  releases: nullableNonNegativeIntegerSchema,
  largest: projectIdentitySchema.nullable(),
  mostActive: projectIdentitySchema.nullable(),
  newest: projectIdentitySchema.nullable(),
  oldest: projectIdentitySchema.nullable(),
});

export type Summary = z.infer<typeof summarySchema>;
