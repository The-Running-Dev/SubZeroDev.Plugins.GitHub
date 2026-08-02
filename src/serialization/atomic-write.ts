import { dirname, join } from 'node:path';

import type { FileSystemPort } from '../services/ports.js';
import { confinedPath } from './path-confinement.js';

export interface StagedFile {
  readonly relativePath: string;
  readonly stagingPath: string;
  readonly destinationPath: string;
}

export interface ArtifactReference {
  readonly relativePath: string;
}

/**
 * Stages complete files under the live root and publishes each with a file rename.
 * The staging directory is deliberately on the same volume as every destination.
 */
export class StagingArea {
  private readonly files: StagedFile[] = [];
  private readonly stagingRoot: string;

  public constructor(
    private readonly fileSystem: FileSystemPort,
    private readonly liveRoot: string,
    runId: string,
  ) {
    this.stagingRoot = confinedPath(liveRoot, `.staging-${runId}`);
  }

  public async stage(relativePath: string, contents: string): Promise<StagedFile> {
    const destinationPath = confinedPath(this.liveRoot, relativePath);
    const stagingPath = confinedPath(this.stagingRoot, relativePath);
    await this.fileSystem.mkdir(dirname(stagingPath), { recursive: true });
    await this.fileSystem.writeFile(stagingPath, new TextEncoder().encode(contents));
    const file = { relativePath, stagingPath, destinationPath };
    this.files.push(file);
    return file;
  }

  public async commit(): Promise<readonly ArtifactReference[]> {
    const committed: ArtifactReference[] = [];
    for (const file of this.files) {
      await this.fileSystem.mkdir(dirname(file.destinationPath), { recursive: true });
      await this.fileSystem.rename(file.stagingPath, file.destinationPath);
      committed.push({ relativePath: file.relativePath });
    }
    await this.fileSystem.remove(this.stagingRoot, { recursive: true });
    return committed;
  }

  public async discard(): Promise<void> {
    await this.fileSystem.remove(this.stagingRoot, { recursive: true });
  }

  public root(): string {
    return this.stagingRoot;
  }
}

export async function reclaimStagingDirectories(
  fileSystem: FileSystemPort,
  liveRoot: string,
): Promise<readonly string[]> {
  const reclaimed: string[] = [];
  let entries: readonly string[];
  try {
    entries = await fileSystem.readdir(liveRoot);
  } catch (error: unknown) {
    if (isMissingFile(error)) return [];
    throw error;
  }
  for (const entry of entries) {
    if (!entry.startsWith('.staging-')) continue;
    const path = join(liveRoot, entry);
    await fileSystem.remove(path, { recursive: true });
    reclaimed.push(entry);
  }
  return reclaimed;
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
