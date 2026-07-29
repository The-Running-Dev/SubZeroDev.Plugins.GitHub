import { describe, expect, it } from 'vitest';

import { compareIdentity, compareProviderId } from '../../src/models/identity.js';
import { compareCodeUnits } from '../../src/models/primitives.js';

describe('code-unit ordering', () => {
  // Each pair orders one way by code unit and the other way under a locale-aware
  // collation, so a `localeCompare` regression fails here rather than surfacing as
  // output that differs between two machines. See compareCodeUnits.
  it.each([
    ['wisp', 'XML'],
    ['nesC', 'Nim'],
    ['eC', 'Elm'],
    ['sed', 'Slash'],
    ['reStructuredText', 'Roff'],
  ])('orders %s after %s, as code units do', (lowerInitial, upperInitial) => {
    expect(compareCodeUnits(lowerInitial, upperInitial)).toBe(1);
    expect(compareCodeUnits(upperInitial, lowerInitial)).toBe(-1);
  });

  it('is locale-independent where localeCompare is not', () => {
    // 'aa' vs 'ab' is -1 under en and +1 under da. Code units have one answer.
    expect(compareCodeUnits('aa', 'ab')).toBe(-1);
    expect(compareCodeUnits('a', 'B')).toBe(1);
    expect(compareCodeUnits('same', 'same')).toBe(0);
  });
});

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
