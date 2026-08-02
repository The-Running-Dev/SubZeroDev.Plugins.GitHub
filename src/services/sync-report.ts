import type { CachedProject } from '../cache/reconcile.js';
import { compareIdentity } from '../models/identity.js';
import {
  SCHEMA_VERSION,
  syncReportDocumentSchema,
  type SyncReportDocument,
} from '../models/documents.js';

export function buildSyncReport(projects: readonly CachedProject[]): SyncReportDocument {
  const ordered = [...projects].sort((left, right) =>
    compareIdentity(left.project.repository.identity, right.project.repository.identity),
  );
  return syncReportDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    repositories: {
      total: ordered.length,
      partial: ordered.filter(({ partial }) => partial).length,
    },
    diagnostics: ordered.flatMap(({ diagnostics }) => diagnostics),
  });
}
