import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  orderProjectsByIdentity,
  parseProjectsDocument,
  projectsDocumentSchema,
  projectSchema,
  type Project,
} from '../../src/models/index.js';
import { canonicalJson } from '../../src/serialization/canonical-json.js';

const projectFixtureDirectory = fileURLToPath(new URL('../fixtures/projects/', import.meta.url));
const invalidFixtureDirectory = fileURLToPath(new URL('../fixtures/invalid/', import.meta.url));
const projectFixtureNames = readdirSync(projectFixtureDirectory)
  .filter((name) => name.endsWith('.json'))
  .sort();

describe('project fixtures', () => {
  it('contains every required Milestone 1 scenario', () => {
    expect(projectFixtureNames).toEqual([
      'archived.json',
      'complete.json',
      'fork.json',
      'minimum.json',
      'private.json',
      'template.json',
      'unicode.json',
    ]);
  });

  it.each(projectFixtureNames)('%s round-trips without a semantic change', (name) => {
    const parsed = projectSchema.parse(readJson(projectFixtureDirectory, name));
    const roundTripped = projectSchema.parse(JSON.parse(JSON.stringify(parsed)));

    expect(roundTripped).toEqual(parsed);
  });

  it('emits projects in the same identity order for shuffled input', () => {
    const projects = projectFixtureNames.map((name) =>
      projectSchema.parse(readJson(projectFixtureDirectory, name)),
    );
    const document = (items: readonly Project[]) => ({
      schemaVersion: '1.0.0',
      projects: orderProjectsByIdentity(items),
    });

    expect(canonicalJson(document(projects))).toBe(
      canonicalJson(document([...projects].reverse())),
    );
    expect(
      document(projects).projects.map((project) => project.repository.identity.providerId),
    ).toEqual(['1', '2', '3', '4', '5', '6', '18446744073709551616']);
  });

  it('can be converted to JSON Schema from the Zod source of truth', () => {
    expect(() => z.toJSONSchema(projectsDocumentSchema)).not.toThrow();
  });
});

describe('invalid project fixtures', () => {
  it.each([
    ['bad-schema-version.json', ['schemaVersion']],
    ['non-utc-timestamp.json', ['repository', 'createdAt']],
    ['bad-url.json', ['repository', 'webUrl']],
    ['bad-percentage.json', ['technology', 'languages', 0, 'percentage']],
    ['numeric-provider-id.json', ['repository', 'identity', 'providerId']],
  ] as const)('%s reports the offending field path', (name, expectedPath) => {
    const result = projectSchema.safeParse(readJson(invalidFixtureDirectory, name));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual(expectedPath);
    }
  });

  it('reports a duplicate identity at the duplicate provider ID', () => {
    try {
      parseProjectsDocument(readJson(invalidFixtureDirectory, 'duplicate-id.json'));
      throw new Error('Expected duplicate fixture to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(z.ZodError);
      expect((error as z.ZodError).issues).toContainEqual(
        expect.objectContaining({
          path: ['projects', 1, 'repository', 'identity', 'providerId'],
        }),
      );
    }
  });
});

function readJson(directory: string, name: string): unknown {
  return JSON.parse(readFileSync(`${directory}/${name}`, 'utf8')) as unknown;
}
