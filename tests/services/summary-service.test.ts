import { describe, expect, it } from 'vitest';

import { calculateSummary } from '../../src/services/summary-service.js';
import { projectFixture } from '../support/project-fixture.js';

describe('portfolio summary', () => {
  it('keeps every selection present and null for an empty portfolio', () => {
    expect(calculateSummary([])).toEqual({
      total: 0,
      public: 0,
      private: 0,
      archived: 0,
      languages: [],
      stars: 0,
      forks: 0,
      releases: 0,
      largest: null,
      mostActive: null,
      newest: null,
      oldest: null,
    });
  });

  it('resolves every selection tie to the lower numeric provider ID', () => {
    const tied = [
      projectFixture({ id: '10', sizeKilobytes: 50 }),
      projectFixture({ id: '2', sizeKilobytes: 50 }),
    ];

    expect(calculateSummary(tied)).toMatchObject({
      largest: { provider: 'github', providerId: '2' },
      mostActive: { provider: 'github', providerId: '2' },
      newest: { provider: 'github', providerId: '2' },
      oldest: { provider: 'github', providerId: '2' },
    });
  });

  it('aggregates language bytes before applying deterministic percentages', () => {
    const summary = calculateSummary([
      projectFixture({
        id: '1',
        languages: [{ name: 'TypeScript', bytes: 2, percentage: 100 }],
      }),
      projectFixture({
        id: '2',
        languages: [
          { name: 'TypeScript', bytes: 1, percentage: 50 },
          { name: 'Rust', bytes: 1, percentage: 50 },
        ],
      }),
    ]);

    expect(summary.languages).toEqual([
      { name: 'TypeScript', bytes: 3, percentage: 75 },
      { name: 'Rust', bytes: 1, percentage: 25 },
    ]);
  });

  it('propagates an unavailable total and ignores unavailable selection values', () => {
    const summary = calculateSummary([
      projectFixture({ id: '1', stars: null, sizeKilobytes: null }),
      projectFixture({ id: '2', stars: 2, sizeKilobytes: 3 }),
    ]);

    expect(summary.stars).toBeNull();
    expect(summary.largest).toEqual({ provider: 'github', providerId: '2' });
  });
});
