import { randomUUID } from 'node:crypto';

import { CacheError, type RepositoryCache } from '../cache/store.js';
import type { ArtifactReference } from '../output/envelope.js';
import { buildSyncReport } from '../output/sync-report.js';
import { StagingArea } from '../serialization/atomic-write.js';
import {
  buildOutputDocuments,
  type OutputDocumentSet,
  type OutputFormat,
} from '../serialization/documents.js';
import { sha256 } from '../serialization/digest.js';
import type { FileSystemPort } from './ports.js';
import { applyPortfolioOverrides, type PortfolioOverrides } from './portfolio-service.js';

export class ExportError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ExportError';
  }
}

export async function exportCachedProjects(input: {
  readonly cache: RepositoryCache;
  readonly fileSystem: FileSystemPort;
  readonly outputDirectory: string;
  readonly formats: readonly OutputFormat[];
  readonly runId?: () => string;
  readonly portfolioOverrides?: PortfolioOverrides;
}): Promise<{
  readonly documents: OutputDocumentSet;
  readonly artifacts: readonly ArtifactReference[];
}> {
  const prepared = await previewCachedProjects({
    cache: input.cache,
    formats: input.formats,
    reclaim: true,
    ...(input.portfolioOverrides === undefined
      ? {}
      : { portfolioOverrides: input.portfolioOverrides }),
  });
  const files = outputFiles(prepared.documents);
  const staging = new StagingArea(
    input.fileSystem,
    input.outputDirectory,
    (input.runId ?? randomUUID)(),
  );
  try {
    for (const file of files) await staging.stage(file.path, file.contents);
    await staging.commit();
  } catch (error: unknown) {
    await staging.discard();
    throw new ExportError(error instanceof Error ? error.message : 'Could not publish exports.');
  }
  return prepared;
}

export async function previewCachedProjects(input: {
  readonly cache: RepositoryCache;
  readonly formats: readonly OutputFormat[];
  readonly reclaim?: boolean;
  readonly portfolioOverrides?: PortfolioOverrides;
}): Promise<{
  readonly documents: OutputDocumentSet;
  readonly artifacts: readonly ArtifactReference[];
}> {
  let snapshot;
  try {
    snapshot = await input.cache.read({ reclaim: input.reclaim ?? false });
  } catch (error: unknown) {
    if (error instanceof CacheError) throw new ExportError(error.message);
    throw error;
  }
  if (snapshot === null)
    throw new ExportError('No synchronized cache is available; run sync first.');

  const documents = buildOutputDocuments({
    projects: applyPortfolioOverrides(
      snapshot.projects.map(({ project }) => project),
      input.portfolioOverrides ?? new Map(),
    ),
    report: buildSyncReport(snapshot.projects),
    formats: input.formats,
  });
  const files = outputFiles(documents);
  return {
    documents,
    artifacts: files.map((file) => ({
      name: file.name,
      path: file.path,
      bytes: new TextEncoder().encode(file.contents).byteLength,
      sha256: sha256(file.contents),
      mediaType: file.mediaType,
    })),
  };
}

interface OutputFile {
  readonly name: string;
  readonly path: string;
  readonly contents: string;
  readonly mediaType: string;
}

function outputFiles(documents: OutputDocumentSet): readonly OutputFile[] {
  return [
    {
      name: 'projects-json',
      path: 'projects.json',
      contents: documents.projectsJson,
      mediaType: 'application/json',
    },
    ...(documents.projectsYaml === null
      ? []
      : [
          {
            name: 'projects-yaml',
            path: 'projects.yaml',
            contents: documents.projectsYaml,
            mediaType: 'application/yaml',
          },
        ]),
    {
      name: 'projects-schema',
      path: 'projects.schema.json',
      contents: documents.projectsSchemaJson,
      mediaType: 'application/schema+json',
    },
    {
      name: 'statistics-json',
      path: 'statistics.json',
      contents: documents.statisticsJson,
      mediaType: 'application/json',
    },
    {
      name: 'summary-json',
      path: 'summary.json',
      contents: documents.summaryJson,
      mediaType: 'application/json',
    },
    {
      name: 'sync-report-json',
      path: 'sync-report.json',
      contents: documents.syncReportJson,
      mediaType: 'application/json',
    },
  ];
}
