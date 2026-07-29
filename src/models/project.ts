import { z } from 'zod';

import { diagnosticSchema } from './diagnostics.js';
import { languageStatisticsSchema } from './language.js';
import { portfolioOverrideSchema } from './portfolio.js';
import { repositorySchema } from './repository.js';
import { releaseSummarySchema } from './release.js';
import { SCHEMA_VERSION, schemaVersionSchema } from './schema-version.js';
import { contributorSummarySchema } from './contributor.js';
import { repositoryStatisticsSchema } from './statistics.js';

export const projectSchema = z.object({
  schemaVersion: schemaVersionSchema,
  repository: repositorySchema,
  technology: z.object({
    primaryLanguage: z.string().nullable(),
    languages: z.array(languageStatisticsSchema),
  }),
  statistics: repositoryStatisticsSchema,
  releases: releaseSummarySchema,
  contributors: contributorSummarySchema,
  portfolio: portfolioOverrideSchema,
  diagnostics: z.array(diagnosticSchema),
});

export type Project = z.infer<typeof projectSchema>;

export { SCHEMA_VERSION };
