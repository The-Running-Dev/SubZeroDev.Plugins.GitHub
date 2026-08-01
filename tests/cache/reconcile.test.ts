import { describe, expect, it } from 'vitest';

import type { CachedProject } from '../../src/cache/reconcile.js';
import { reconcileProjects } from '../../src/cache/reconcile.js';
import { projectFixture } from '../support/project-fixture.js';

describe('cache reconciliation', () => {
  it('keys a rename on immutable identity', () => {
    const previous = cached(projectFixture({ id: '42' }));
    const project = structuredClone(previous.project);
    project.repository.owner = 'new-owner';
    project.repository.name = 'renamed';
    project.repository.slug = 'new-owner/renamed';

    expect(reconcileProjects([previous], [cached(project)]).changes).toEqual([
      {
        kind: 'renamed',
        identity: { provider: 'github', providerId: '42' },
        from: 'fixture/repository-42',
        to: 'new-owner/renamed',
      },
    ]);
  });

  it('distinguishes additions, archive transitions, updates, and removals', () => {
    const previous = [
      cached(projectFixture({ id: '1' })),
      cached(projectFixture({ id: '2' })),
      cached(projectFixture({ id: '3', stars: 1 })),
    ];
    const observed = [
      cached(projectFixture({ id: '1', archived: true })),
      cached(projectFixture({ id: '3', stars: 2 })),
      cached(projectFixture({ id: '4' })),
    ];

    expect(reconcileProjects(previous, observed).changes.map((change) => change.kind)).toEqual([
      'archived',
      'removed',
      'updated',
      'added',
    ]);
  });

  it('retains the prior document for a failed repository', () => {
    const prior = cached(projectFixture({ id: '7' }));
    const result = reconcileProjects([prior], [], [{ provider: 'github', providerId: '7' }]);

    expect(result.changes).toEqual([
      { kind: 'failed', identity: { provider: 'github', providerId: '7' }, retained: true },
    ]);
    expect(result.next).toEqual([prior]);
  });

  it('does not report volatile search counts as an update', () => {
    const previous = cached(projectFixture({ id: '8', closedIssues: 1 }));
    const observed = cached(projectFixture({ id: '8', closedIssues: 2 }));

    expect(reconcileProjects([previous], [observed]).changes[0]?.kind).toBe('unchanged');
  });
});

function cached(project: ReturnType<typeof projectFixture>): CachedProject {
  return { project, resources: [], diagnostics: [], partial: false };
}
