import { describe, expect, it } from 'vitest';

import { projectSchema, SCHEMA_VERSION } from '../src/models/project.js';

describe('project schema', () => {
  it('accepts a versioned provider-independent project', () => {
    const project = projectSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      id: 'repository-1',
      name: 'Example',
      provider: 'github',
    });

    expect(project.name).toBe('Example');
  });

  it('rejects an unsupported schema version', () => {
    expect(() =>
      projectSchema.parse({
        schemaVersion: '0.0.0',
        id: 'repository-1',
        name: 'Example',
        provider: 'github',
      }),
    ).toThrow();
  });
});
