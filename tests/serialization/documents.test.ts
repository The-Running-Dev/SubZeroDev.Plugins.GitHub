import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { SCHEMA_VERSION } from '../../src/models/schema-version.js';
import { buildOutputDocuments } from '../../src/serialization/documents.js';
import { projectFixture } from '../support/project-fixture.js';

describe('deterministic output documents', () => {
  it('produces identical bytes across independent runs and equivalent JSON/YAML values', () => {
    const input = fixtureInput();
    const first = buildOutputDocuments(input);
    const second = buildOutputDocuments(input);

    expect(second).toEqual(first);
    expect(parse(first.projectsYaml as string)).toEqual(JSON.parse(first.projectsJson));
    for (const document of [
      first.projectsJson,
      first.projectsYaml,
      first.statisticsJson,
      first.summaryJson,
      first.projectsSchemaJson,
      first.syncReportJson,
    ]) {
      if (document === null) continue;
      expect(document.endsWith('\n')).toBe(true);
      expect(document.endsWith('\n\n')).toBe(false);
      expect(document).not.toContain('\r');
      expect(document).not.toContain('runId');
      expect(document).not.toMatch(/generatedAt|exportedAt|synchronizedAt/);
    }
  });

  it('omits YAML only when it is not requested', () => {
    expect(buildOutputDocuments({ ...fixtureInput(), formats: ['json'] }).projectsYaml).toBeNull();
  });
});

export function fixtureInput() {
  return {
    projects: [
      projectFixture({
        id: '10',
        stars: 5,
        languages: [{ name: 'TypeScript', bytes: 2, percentage: 100 }],
      }),
      projectFixture({
        id: '2',
        stars: 3,
        languages: [{ name: 'Rust', bytes: 1, percentage: 100 }],
      }),
    ],
    report: {
      schemaVersion: SCHEMA_VERSION,
      repositories: { total: 2, partial: 0 },
      diagnostics: [],
    },
    formats: ['json', 'yaml'] as const,
  };
}
