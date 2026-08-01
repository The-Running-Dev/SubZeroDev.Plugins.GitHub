import { describe, expect, it } from 'vitest';

import { calculateAggregateStatistics } from '../../src/services/statistics-service.js';
import { projectFixture } from '../support/project-fixture.js';

describe('aggregate statistics', () => {
  it('sums complete facts and counts repository categories', () => {
    const statistics = calculateAggregateStatistics([
      projectFixture({
        id: '10',
        sizeKilobytes: 10,
        stars: 2,
        forks: 3,
        watchers: 4,
        commits: 5,
        branches: 6,
        tags: 7,
        releases: 8,
        contributors: 9,
        openIssues: 1,
        closedIssues: 2,
        openPullRequests: 3,
        closedPullRequests: 4,
      }),
      projectFixture({
        id: '20',
        visibility: 'private',
        archived: true,
        sizeKilobytes: 20,
        stars: 4,
        forks: 6,
        watchers: 8,
        commits: 10,
        branches: 12,
        tags: 14,
        releases: 16,
        contributors: 18,
        openIssues: 2,
        closedIssues: 4,
        openPullRequests: 6,
        closedPullRequests: 8,
      }),
    ]);

    expect(statistics).toEqual({
      repositories: { total: 2, public: 1, private: 1, archived: 1 },
      sizeKilobytes: 30,
      stars: 6,
      forks: 9,
      watchers: 12,
      commits: 15,
      branches: 18,
      tags: 21,
      releases: 24,
      contributors: 27,
      issues: { open: 3, closed: 6 },
      pullRequests: { open: 9, closed: 12 },
    });
  });

  it('propagates unavailable facts instead of treating them as zero', () => {
    const statistics = calculateAggregateStatistics([
      projectFixture({ id: '1', commits: 3 }),
      projectFixture({ id: '2', commits: null }),
    ]);

    expect(statistics.commits).toBeNull();
    expect(statistics.stars).toBe(0);
  });
});
