import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';

import { compareIdentity } from '../models/identity.js';
import { projectSchema, SCHEMA_VERSION, type Project } from '../models/project.js';
import { compareCodeUnits } from '../models/primitives.js';
import { canonicalJson } from '../serialization/canonical-json.js';
import { confinedPath } from '../serialization/path-confinement.js';
import { StagingArea } from '../serialization/atomic-write.js';
import type { FileSystemPort } from '../services/ports.js';
import { contentHash, documentHash } from './content-hash.js';
import {
  CACHE_VERSION,
  cacheManifestSchema,
  type CacheEntry,
  type CacheManifest,
} from './manifest.js';
import type { CachedProject } from './reconcile.js';
import { manifestIntegrityIssue, projectIntegrityIssue } from './integrity.js';
import { reclaimStagingDirectories, reclaimUnreferencedRepositoryDocuments } from './reclaim.js';

export interface CacheOwner {
  readonly provider: string;
  readonly providerId: string;
  readonly login: string;
}

export interface CacheSnapshot {
  readonly owner: CacheOwner;
  readonly synchronizedAt: string | null;
  readonly projects: readonly CachedProject[];
  /** Compatibility view used by local-only list until M7 renders projects directly. */
  readonly repositories: readonly Project['repository'][];
}

export class CacheError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CacheError';
  }
}

export class CacheVersionError extends CacheError {
  public constructor(message: string) {
    super(message);
    this.name = 'CacheVersionError';
  }
}

/**
 * A manifest is the commit record. Project documents are content-addressed, so
 * publishing them cannot invalidate the snapshot named by the old manifest.
 */
export class RepositoryCache {
  private readonly directory: string;

  public constructor(
    private readonly fileSystem: FileSystemPort,
    directory: string,
    private readonly runId: () => string = randomUUID,
  ) {
    this.directory = resolve(directory);
  }

  public async read(): Promise<CacheSnapshot | null> {
    await reclaimStagingDirectories(this.fileSystem, this.directory);
    const manifest = await this.readManifest();
    if (manifest === null) return null;
    const manifestIssue = manifestIntegrityIssue(manifest);
    if (manifestIssue !== null) throw new CacheError(manifestIssue);

    const projects: CachedProject[] = [];
    for (const entry of manifest.repositories) {
      const project = await this.readProject(entry);
      projects.push({
        project,
        resources: entry.resources,
        diagnostics: entry.diagnostics,
        partial: entry.partial,
      });
    }
    projects.sort(compareCachedProjects);
    return {
      owner: manifest.owner,
      synchronizedAt: manifest.lastCompleteSync,
      projects,
      repositories: projects.map(({ project }) => project.repository),
    };
  }

  public async write(input: {
    readonly owner: CacheOwner;
    readonly synchronizedAt: string | null;
    readonly projects: readonly CachedProject[];
  }): Promise<void> {
    await this.fileSystem.mkdir(this.directory, { recursive: true });
    await reclaimStagingDirectories(this.fileSystem, this.directory);
    const sorted = [...input.projects].sort(compareCachedProjects);
    assertUniqueProjects(sorted);
    const entries = sorted.map(toCacheEntry);
    const manifest: CacheManifest = cacheManifestSchema.parse({
      cacheVersion: CACHE_VERSION,
      schemaVersion: SCHEMA_VERSION,
      owner: input.owner,
      lastCompleteSync: input.synchronizedAt,
      repositories: entries,
    });

    const staging = new StagingArea(this.fileSystem, this.directory, this.runId());
    try {
      for (const [index, cached] of sorted.entries()) {
        const entry = entries[index];
        if (entry === undefined) throw new CacheError('Cache entry ordering failed.');
        if ((await this.fileSystem.stat(confinedPath(this.directory, entry.document))) === null) {
          await staging.stage(entry.document, canonicalJson(cached.project));
        }
      }
      // The manifest is always last: it is the only publication point.
      await staging.stage('manifest.json', canonicalJson(manifest));
      await staging.commit();
      await reclaimUnreferencedRepositoryDocuments(
        this.fileSystem,
        this.directory,
        new Set(entries.map((entry) => entry.document)),
      );
    } catch (error: unknown) {
      await staging.discard();
      throw error;
    }
  }

  private async readManifest(): Promise<CacheManifest | null> {
    let bytes: Uint8Array;
    try {
      bytes = await this.fileSystem.readFile(this.manifestPath());
    } catch (error: unknown) {
      if (isMissingFile(error)) return null;
      throw error;
    }
    const value = parseJson(bytes, 'cache manifest', this.manifestPath());
    if (
      isRecord(value) &&
      typeof value.cacheVersion === 'string' &&
      value.cacheVersion !== CACHE_VERSION
    ) {
      throw new CacheVersionError(
        `Cache version ${value.cacheVersion} is incompatible with ${CACHE_VERSION}; run sync with a clean cache directory.`,
      );
    }
    const result = cacheManifestSchema.safeParse(value);
    if (!result.success) {
      throw new CacheError(
        `Invalid cache manifest at ${this.manifestPath()}: ${result.error.issues[0]?.message ?? 'unknown error'}`,
      );
    }
    return result.data;
  }

  private async readProject(entry: CacheEntry): Promise<Project> {
    let path: string;
    try {
      path = confinedPath(this.directory, entry.document);
    } catch {
      throw new CacheError(
        `Repository ${entry.providerId} cache document path escapes the cache root.`,
      );
    }
    let bytes: Uint8Array;
    try {
      bytes = await this.fileSystem.readFile(path);
    } catch (error: unknown) {
      if (isMissingFile(error)) {
        throw new CacheError(
          `Cache manifest references a missing repository ${entry.providerId} document.`,
        );
      }
      throw error;
    }
    const text = new TextDecoder().decode(bytes);
    const result = projectSchema.safeParse(
      parseJson(bytes, `repository ${entry.providerId}`, path),
    );
    if (!result.success) {
      throw new CacheError(
        `Invalid repository ${entry.providerId} document at ${path}: ${result.error.issues[0]?.message ?? 'unknown error'}`,
      );
    }
    const integrityIssue = projectIntegrityIssue(result.data, entry, text);
    if (integrityIssue !== null) throw new CacheError(integrityIssue);
    return result.data;
  }

  private manifestPath(): string {
    return join(this.directory, 'manifest.json');
  }
}

function toCacheEntry(cached: CachedProject): CacheEntry {
  const projectDocumentHash = documentHash(cached.project);
  const providerId = cached.project.repository.identity.providerId;
  return {
    providerId,
    slug: cached.project.repository.slug,
    document: `repositories/${providerId}-${projectDocumentHash}.json`,
    documentHash: projectDocumentHash,
    contentHash: contentHash(cached.project),
    resources: [...cached.resources].sort((left, right) => compareCodeUnits(left.key, right.key)),
    diagnostics: [...cached.diagnostics],
    partial: cached.partial,
  };
}

function parseJson(bytes: Uint8Array, description: string, path: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new CacheError(`Could not read ${description} at ${path}.`);
  }
}

function assertUniqueProjects(projects: readonly CachedProject[]): void {
  for (let index = 1; index < projects.length; index += 1) {
    const previous = projects[index - 1];
    const current = projects[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      compareCachedProjects(previous, current) === 0
    ) {
      throw new CacheError(
        `Duplicate repository identity ${current.project.repository.identity.providerId}.`,
      );
    }
  }
}

function compareCachedProjects(left: CachedProject, right: CachedProject): -1 | 0 | 1 {
  return compareIdentity(left.project.repository.identity, right.project.repository.identity);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
