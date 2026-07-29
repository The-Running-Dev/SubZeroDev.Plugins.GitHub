import { describe, expect, it } from 'vitest';

import {
  checkSchemaVersion,
  describeSchemaCompatibility,
  SCHEMA_VERSION,
} from '../../src/models/schema-version.js';

describe('schema version compatibility', () => {
  it('accepts the same major, including a higher minor or patch', () => {
    for (const version of [SCHEMA_VERSION, '1.0.1', '1.9.9', '1.10.0']) {
      expect(checkSchemaVersion(version)).toEqual({ kind: 'compatible', found: version });
    }
  });

  it('refuses another major and names both versions', () => {
    const result = checkSchemaVersion('2.0.0');

    expect(result).toEqual({
      kind: 'incompatible-major',
      found: '2.0.0',
      expected: SCHEMA_VERSION,
    });
    // Both versions in the message: a reader must not have to look up what was expected.
    expect(describeSchemaCompatibility(result)).toContain('2.0.0');
    expect(describeSchemaCompatibility(result)).toContain(SCHEMA_VERSION);
  });

  it('distinguishes an unreadable version from an incompatible one', () => {
    for (const version of ['banana', '1.0', '', '1.0.0-rc.1', '01.0.0']) {
      expect(checkSchemaVersion(version).kind).toBe('unparseable');
    }

    // The distinction is the point: only one of these can be fixed by re-running export.
    expect(checkSchemaVersion('0.9.0').kind).toBe('incompatible-major');
  });

  it('never throws, so a caller can report rather than crash', () => {
    expect(() => checkSchemaVersion('nonsense')).not.toThrow();
  });
});
