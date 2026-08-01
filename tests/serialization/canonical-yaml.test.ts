import { describe, expect, it } from 'vitest';

import { stringifyCanonical, sortKeysDeep } from '../../src/serialization/canonical-json.js';
import { stringifyCanonicalYaml } from '../../src/serialization/canonical-yaml.js';

describe('canonical serializers', () => {
  it('sorts keys by code unit without changing array order or Unicode', () => {
    const value = { z: [{ b: 'é', a: 'é' }], A: true, a: null } as const;
    expect(sortKeysDeep(value)).toEqual({ A: true, a: null, z: [{ a: 'é', b: 'é' }] });
    expect(stringifyCanonical(value)).toBe(
      '{\n  "A": true,\n  "a": null,\n  "z": [\n    {\n      "a": "é",\n      "b": "é"\n    }\n  ]\n}\n',
    );
  });

  it('pins YAML quoting, LF endings, and one trailing newline', () => {
    const yaml = stringifyCanonicalYaml({ yes: 'yes', multiline: 'one\ntwo', count: 2 });
    expect(yaml).toBe('count: 2\nmultiline: "one\\ntwo"\nyes: "yes"\n');
  });
});
