import { describe, expect, it } from 'vitest';

import { searchResourceKey } from '../../../src/providers/github/resource-keys.js';

describe('GitHub resource keys', () => {
  it('keys searches on immutable repository identity and the requested count', () => {
    expect(searchResourceKey('42', 'is:pr is:open')).toBe('search:42:is:pr is:open');
    expect(searchResourceKey('42', 'is:pr is:closed')).not.toBe(
      searchResourceKey('42', 'is:pr is:open'),
    );
  });
});
