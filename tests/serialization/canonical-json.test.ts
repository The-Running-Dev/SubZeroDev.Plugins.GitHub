import { describe, expect, it } from 'vitest';

import { canonicalJson } from '../../src/serialization/canonical-json.js';

describe('canonicalJson', () => {
  it('sorts object keys by code unit while retaining array order', () => {
    expect(canonicalJson({ z: 1, a: { wisp: 1, XML: 2 }, items: ['b', 'a'] })).toBe(
      '{"a":{"XML":2,"wisp":1},"items":["b","a"],"z":1}\n',
    );
  });
});
