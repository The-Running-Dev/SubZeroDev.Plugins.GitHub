import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildOutputDocuments } from '../../src/serialization/documents.js';
import { fixtureInput } from './documents.test.js';

describe('export golden files', () => {
  it('matches all six committed documents byte-for-byte', () => {
    const documents = buildOutputDocuments(fixtureInput());
    const actual = {
      'projects.json': documents.projectsJson,
      'projects.yaml': documents.projectsYaml,
      'projects.schema.json': documents.projectsSchemaJson,
      'statistics.json': documents.statisticsJson,
      'summary.json': documents.summaryJson,
      'sync-report.json': documents.syncReportJson,
    };

    for (const [name, contents] of Object.entries(actual)) {
      expect(contents).toBe(readFileSync(resolve('tests/fixtures/golden', name), 'utf8'));
    }
  });
});
