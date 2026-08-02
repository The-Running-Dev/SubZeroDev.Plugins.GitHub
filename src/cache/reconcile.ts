import type { Diagnostic } from '../models/diagnostics.js';
import { compareIdentity, type ProjectIdentity } from '../models/identity.js';
import type { Project } from '../models/project.js';
import { canonicalJson } from '../serialization/canonical-json.js';
import type { CachedResource } from './manifest.js';
import { contentHash, VOLATILE_FIELDS } from './content-hash.js';

export interface CachedProject {
  readonly project: Project;
  readonly resources: readonly CachedResource[];
  readonly diagnostics: readonly Diagnostic[];
  readonly partial: boolean;
}

export type RepositoryChange =
  | { readonly kind: 'added' | 'unchanged' | 'archived'; readonly identity: ProjectIdentity }
  | {
      readonly kind: 'updated';
      readonly identity: ProjectIdentity;
      readonly fields: readonly string[];
    }
  | {
      readonly kind: 'renamed';
      readonly identity: ProjectIdentity;
      readonly from: string;
      readonly to: string;
    }
  | { readonly kind: 'removed'; readonly identity: ProjectIdentity; readonly lastSlug: string }
  | { readonly kind: 'failed'; readonly identity: ProjectIdentity; readonly retained: boolean };

export function reconcileProjects(
  previous: readonly CachedProject[],
  observed: readonly CachedProject[],
  failed: readonly ProjectIdentity[] = [],
): { readonly changes: readonly RepositoryChange[]; readonly next: readonly CachedProject[] } {
  const previousById = new Map(
    previous.map((entry) => [key(entry.project.repository.identity), entry]),
  );
  const observedById = new Map(
    observed.map((entry) => [key(entry.project.repository.identity), entry]),
  );
  const failedIds = new Set(failed.map(key));
  const changes: RepositoryChange[] = [];
  const next: CachedProject[] = [];

  for (const current of observed) {
    const identity = current.project.repository.identity;
    const prior = previousById.get(key(identity));
    next.push(current);
    if (prior === undefined) {
      changes.push({ kind: 'added', identity });
    } else if (prior.project.repository.slug !== current.project.repository.slug) {
      changes.push({
        kind: 'renamed',
        identity,
        from: prior.project.repository.slug,
        to: current.project.repository.slug,
      });
    } else if (
      prior.project.repository.status !== 'archived' &&
      current.project.repository.status === 'archived'
    ) {
      changes.push({ kind: 'archived', identity });
    } else if (contentHash(prior.project) === contentHash(current.project)) {
      changes.push({ kind: 'unchanged', identity });
    } else {
      changes.push({
        kind: 'updated',
        identity,
        fields: changedFields(prior.project, current.project),
      });
    }
  }

  for (const prior of previous) {
    const identity = prior.project.repository.identity;
    const identityKey = key(identity);
    if (observedById.has(identityKey)) continue;
    if (failedIds.has(identityKey)) {
      next.push(prior);
      changes.push({ kind: 'failed', identity, retained: true });
    } else {
      changes.push({ kind: 'removed', identity, lastSlug: prior.project.repository.slug });
    }
  }

  for (const identity of failed) {
    if (!previousById.has(key(identity)))
      changes.push({ kind: 'failed', identity, retained: false });
  }

  return {
    changes: changes.sort(compareChanges),
    next: next.sort((left, right) =>
      compareIdentity(left.project.repository.identity, right.project.repository.identity),
    ),
  };
}

function changedFields(previous: Project, current: Project): readonly string[] {
  const ignored = new Set<string>(VOLATILE_FIELDS);
  const fields = new Set<string>();
  visit(previous, current, '', fields, ignored);
  return [...fields].sort();
}

function visit(
  previous: unknown,
  current: unknown,
  path: string,
  fields: Set<string>,
  ignored: ReadonlySet<string>,
): void {
  if (ignored.has(path) || canonicalJson(previous) === canonicalJson(current)) return;
  if (!isRecord(previous) || !isRecord(current)) {
    fields.add(path);
    return;
  }
  for (const field of new Set([...Object.keys(previous), ...Object.keys(current)])) {
    visit(
      previous[field],
      current[field],
      path === '' ? field : `${path}.${field}`,
      fields,
      ignored,
    );
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function key(identity: ProjectIdentity): string {
  return `${identity.provider}:${identity.providerId}`;
}

function compareChanges(left: RepositoryChange, right: RepositoryChange): -1 | 0 | 1 {
  return compareIdentity(left.identity, right.identity);
}
