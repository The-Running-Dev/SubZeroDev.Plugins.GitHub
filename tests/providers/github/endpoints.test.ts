import { describe, expect, it } from 'vitest';

import { budgetForProfile } from '../../../src/providers/github/endpoints.js';
import { endpointsForProfile } from '../../../src/providers/github/profiles.js';

describe('GitHub endpoint budget', () => {
  it('keeps profile budgets explicit and monotonic', () => {
    expect(budgetForProfile('basic')).toEqual({ core: 0, search: 0 });
    expect(budgetForProfile('standard')).toEqual({ core: 29, search: 0 });
    expect(budgetForProfile('detailed')).toEqual({ core: 35, search: 3 });
  });

  it('selects only endpoints declared for a profile', () => {
    expect(endpointsForProfile('basic').map((endpoint) => endpoint.resource)).toEqual([
      'repository',
    ]);
    expect(endpointsForProfile('standard').map((endpoint) => endpoint.resource)).toEqual([
      'repository',
      'languages',
      'releases',
      'latest-release',
      'branches',
      'tags',
    ]);
    expect(endpointsForProfile('detailed')).toHaveLength(10);
  });

  it('makes cache and absence behavior explicit for every request', () => {
    for (const endpoint of endpointsForProfile('detailed')) {
      expect(typeof endpoint.supportsEtag).toBe('boolean');
      expect(endpoint.fallback).toBeTruthy();
      expect(endpoint.maxPages).toBeGreaterThan(0);
    }
  });
});
