import { z } from 'zod';

import { nullableNonNegativeIntegerSchema } from './primitives.js';

export const issueSummarySchema = z.object({
  open: nullableNonNegativeIntegerSchema,
  closed: nullableNonNegativeIntegerSchema,
});

export const pullRequestSummarySchema = z.object({
  open: nullableNonNegativeIntegerSchema,
  closed: nullableNonNegativeIntegerSchema,
});

export const repositoryStatisticsSchema = z.object({
  sizeKilobytes: nullableNonNegativeIntegerSchema,
  stars: nullableNonNegativeIntegerSchema,
  forks: nullableNonNegativeIntegerSchema,
  watchers: nullableNonNegativeIntegerSchema,
  commits: nullableNonNegativeIntegerSchema,
  branches: nullableNonNegativeIntegerSchema,
  tags: nullableNonNegativeIntegerSchema,
  issues: issueSummarySchema,
  pullRequests: pullRequestSummarySchema,
});

export type IssueSummary = z.infer<typeof issueSummarySchema>;
export type PullRequestSummary = z.infer<typeof pullRequestSummarySchema>;
export type RepositoryStatistics = z.infer<typeof repositoryStatisticsSchema>;
