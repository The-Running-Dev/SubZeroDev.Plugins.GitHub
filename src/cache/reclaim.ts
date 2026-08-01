import { join } from 'node:path';

import type { FileSystemPort } from '../services/ports.js';
import { reclaimStagingDirectories } from '../serialization/atomic-write.js';

export { reclaimStagingDirectories };

export async function reclaimUnreferencedRepositoryDocuments(
  fileSystem: FileSystemPort,
  cacheRoot: string,
  referenced: ReadonlySet<string>,
): Promise<readonly string[]> {
  const repositoryDirectory = join(cacheRoot, 'repositories');
  let entries: readonly string[];
  try {
    entries = await fileSystem.readdir(repositoryDirectory);
  } catch (error: unknown) {
    if (isMissingFile(error)) return [];
    throw error;
  }
  const removed: string[] = [];
  for (const entry of entries) {
    const relativePath = `repositories/${entry}`;
    if (!entry.endsWith('.json') || referenced.has(relativePath)) continue;
    await fileSystem.remove(join(repositoryDirectory, entry));
    removed.push(relativePath);
  }
  return removed;
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
