import { z } from 'zod';

import { diagnosticSchema } from './diagnostics.js';
import { projectSchema } from './project.js';
import { SCHEMA_VERSION, schemaVersionSchema } from './schema-version.js';
import { summarySchema } from './summary.js';

export const projectsDocumentSchema = z.object({
  schemaVersion: schemaVersionSchema,
  projects: z.array(projectSchema),
});

export const summaryDocumentSchema = z.object({
  schemaVersion: schemaVersionSchema,
  summary: summarySchema,
});

/**
 * **Provisional.** `statistics.json` and `summary.json` are separate documents in the
 * specification's output set, but the aggregate model that distinguishes them —
 * commit, contributor, issue, and pull-request totals across the portfolio — is not
 * built until Milestone 4 introduces `aggregate.ts`. Until then this document
 * deliberately carries the summary shape rather than a guessed one.
 *
 * Reusing `summarySchema` here is therefore a placeholder, not a statement that the
 * two documents are the same. When Milestone 4 lands, `statistics` takes the
 * aggregate schema and this comment goes away; a golden-file test will catch the
 * change, which is the intent.
 */
export const statisticsDocumentSchema = z.object({
  schemaVersion: schemaVersionSchema,
  statistics: summarySchema,
});

export const syncReportDocumentSchema = z.object({
  schemaVersion: schemaVersionSchema,
  diagnostics: z.array(diagnosticSchema),
});

export type ProjectsDocument = z.infer<typeof projectsDocumentSchema>;
export type SummaryDocument = z.infer<typeof summaryDocumentSchema>;
export type StatisticsDocument = z.infer<typeof statisticsDocumentSchema>;
export type SyncReportDocument = z.infer<typeof syncReportDocumentSchema>;

export { SCHEMA_VERSION };

/** Parses a projects document and rejects duplicate provider identities. */
export function parseProjectsDocument(input: unknown): ProjectsDocument {
  const document = projectsDocumentSchema.parse(input);
  const seen = new Map<string, number>();

  document.projects.forEach((project, index) => {
    const { provider, providerId } = project.repository.identity;
    const key = `${provider}:${providerId}`;
    const firstIndex = seen.get(key);
    if (firstIndex !== undefined) {
      throw new z.ZodError([
        {
          code: 'custom',
          message: `Duplicate repository identity; first declared at projects[${String(firstIndex)}]`,
          path: ['projects', index, 'repository', 'identity', 'providerId'],
        },
      ]);
    }
    seen.set(key, index);
  });

  return document;
}
