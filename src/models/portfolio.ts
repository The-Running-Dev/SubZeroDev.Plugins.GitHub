import { z } from 'zod';

import {
  nullableStringSchema,
  nullableTimestampSchema,
  nullableUrlSchema,
  nonEmptyStringSchema,
} from './primitives.js';

export const portfolioOverrideSchema = z.object({
  featured: z.boolean(),
  hidden: z.boolean(),
  displayName: nullableStringSchema,
  summary: nullableStringSchema,
  category: nullableStringSchema,
  status: nullableStringSchema,
  displayOrder: z.number().int().nullable(),
  technologies: z.array(nonEmptyStringSchema),
  demoUrl: nullableUrlSchema,
  documentationUrl: nullableUrlSchema,
  screenshots: z.array(z.url()),
  businessRelevance: nullableStringSchema,
  personalContribution: nullableStringSchema,
  startedAt: nullableTimestampSchema,
  endedAt: nullableTimestampSchema,
  notes: nullableStringSchema,
});

export type PortfolioOverride = z.infer<typeof portfolioOverrideSchema>;
