import type { Project } from '../models/project.js';
import { sha256 } from '../serialization/digest.js';
import { contentHash } from './content-hash.js';
import type { CacheEntry, CacheManifest } from './manifest.js';

export function manifestIntegrityIssue(manifest: CacheManifest): string | null {
  for (let index = 1; index < manifest.repositories.length; index += 1) {
    const previous = manifest.repositories[index - 1];
    const current = manifest.repositories[index];
    if (previous === undefined || current === undefined) continue;
    if (BigInt(previous.providerId) >= BigInt(current.providerId)) {
      return 'Cache manifest repository entries are not uniquely ordered by immutable identity.';
    }
  }
  return null;
}

export function projectIntegrityIssue(
  project: Project,
  entry: CacheEntry,
  serialized: string,
): string | null {
  if (sha256(serialized) !== entry.documentHash) {
    return `Repository ${entry.providerId} cache document failed its integrity check.`;
  }
  if (project.repository.identity.providerId !== entry.providerId) {
    return `Repository ${entry.providerId} cache identity does not match its manifest entry.`;
  }
  if (contentHash(project) !== entry.contentHash) {
    return `Repository ${entry.providerId} cache content hash does not match its manifest entry.`;
  }
  return null;
}
