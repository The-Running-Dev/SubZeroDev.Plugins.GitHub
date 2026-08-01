import {
  orderProjectsByIdentity,
  projectsDocumentSchema,
  statisticsDocumentSchema,
  summaryDocumentSchema,
  syncReportDocumentSchema,
  SCHEMA_VERSION,
  type SyncReportDocument,
} from '../models/documents.js';
import type { Project } from '../models/project.js';
import { calculateAggregateStatistics } from '../services/statistics-service.js';
import { calculateSummary } from '../services/summary-service.js';
import { stringifyCanonical } from './canonical-json.js';
import { stringifyCanonicalYaml } from './canonical-yaml.js';
import { buildProjectsJsonSchema } from './json-schema.js';

export type OutputFormat = 'json' | 'yaml';

export interface OutputDocumentSet {
  readonly projectsJson: string;
  readonly projectsYaml: string | null;
  readonly statisticsJson: string;
  readonly summaryJson: string;
  readonly projectsSchemaJson: string;
  readonly syncReportJson: string;
}

export function buildOutputDocuments(input: {
  readonly projects: readonly Project[];
  readonly report: SyncReportDocument;
  readonly formats: readonly OutputFormat[];
}): OutputDocumentSet {
  const projectsDocument = projectsDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    projects: orderProjectsByIdentity(input.projects),
  });
  const statisticsDocument = statisticsDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    statistics: calculateAggregateStatistics(projectsDocument.projects),
  });
  const summaryDocument = summaryDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    summary: calculateSummary(projectsDocument.projects),
  });
  const report = syncReportDocumentSchema.parse(input.report);

  return {
    projectsJson: stringifyCanonical(projectsDocument),
    projectsYaml: input.formats.includes('yaml') ? stringifyCanonicalYaml(projectsDocument) : null,
    statisticsJson: stringifyCanonical(statisticsDocument),
    summaryJson: stringifyCanonical(summaryDocument),
    projectsSchemaJson: stringifyCanonical(buildProjectsJsonSchema()),
    syncReportJson: stringifyCanonical(report),
  };
}
