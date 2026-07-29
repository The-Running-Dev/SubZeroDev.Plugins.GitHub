import { describe, expect, it } from 'vitest';

import { compareIdentity, compareProviderId } from '../../src/models/identity.js';

describe('provider identities', () => {
  it('orders numeric provider IDs instead of comparing their strings', () => {
    expect(compareProviderId('9', '10')).toBe(-1);
    expect(compareProviderId('18446744073709551616', '9')).toBe(1);
  });

  it('uses provider before the immutable numeric ID', () => {
    expect(
      compareIdentity(
        { provider: 'github', providerId: '10' },
        { provider: 'gitlab', providerId: '1' },
      ),
    ).toBe(-1);
  });

  it('treats a rename as the same identity', () => {
    const beforeRename = { provider: 'github', providerId: '123' };
    const afterRename = { provider: 'github', providerId: '123' };

    expect(compareIdentity(beforeRename, afterRename)).toBe(0);
  });
});
