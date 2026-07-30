import { describe, expect, it } from 'vitest';

import { budgetForProfile } from '../../../src/providers/github/endpoints.js';

describe('GitHub endpoint budget', () => {
  it('keeps profile budgets explicit and monotonic', () => {
    expect(budgetForProfile('basic')).toEqual({ core: 0, search: 0 });
    expect(budgetForProfile('standard')).toEqual({ core: 4, search: 0 });
    expect(budgetForProfile('detailed')).toEqual({ core: 6, search: 4 });
  });
});
