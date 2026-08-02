import { z } from 'zod';

import { nullableNonNegativeIntegerSchema } from './primitives.js';

const aggregateCountPairSchema = z.object({
  open: nullableNonNegativeIntegerSchema,
  closed: nullableNonNegativeIntegerSchema,
});

/** Portfolio-wide facts used by `statistics.json`; selections live in `summary.json`. */
export const aggregateStatisticsSchema = z.object({
  repositories: z.object({
    total: z.number().int().min(0),
    public: z.number().int().min(0),
    private: z.number().int().min(0),
    archived: z.number().int().min(0),
  }),
  sizeKilobytes: nullableNonNegativeIntegerSchema,
  stars: nullableNonNegativeIntegerSchema,
  forks: nullableNonNegativeIntegerSchema,
  watchers: nullableNonNegativeIntegerSchema,
  commits: nullableNonNegativeIntegerSchema,
  branches: nullableNonNegativeIntegerSchema,
  tags: nullableNonNegativeIntegerSchema,
  releases: nullableNonNegativeIntegerSchema,
  contributors: nullableNonNegativeIntegerSchema,
  issues: aggregateCountPairSchema,
  pullRequests: aggregateCountPairSchema,
});

export type AggregateStatistics = z.infer<typeof aggregateStatisticsSchema>;
