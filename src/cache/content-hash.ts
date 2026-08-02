import type { Project } from '../models/project.js';
import { canonicalJson } from '../serialization/canonical-json.js';
import { sha256 } from '../serialization/digest.js';

/** Search-derived counts can change without the repository itself changing. */
export const VOLATILE_FIELDS = [
  'statistics.issues.closed',
  'statistics.pullRequests.closed',
] as const;

export function contentHash(project: Project): string {
  const stable = structuredClone(project);
  stable.statistics.issues.closed = null;
  stable.statistics.pullRequests.closed = null;
  return sha256(canonicalJson(stable));
}

export function documentHash(project: Project): string {
  return sha256(canonicalJson(project));
}
