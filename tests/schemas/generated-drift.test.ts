import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';
import type { Ajv2020 as Ajv2020Class } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';

import { stringifyCanonical } from '../../src/serialization/canonical-json.js';
import { buildProjectsJsonSchema } from '../../src/serialization/json-schema.js';
import { buildOutputDocuments } from '../../src/serialization/documents.js';
import { fixtureInput } from '../serialization/documents.test.js';
import { buildCommandInputSchema } from '../../src/serialization/command-schema.js';
import { COMMAND_NAMES } from '../../src/commands/types.js';

const require = createRequire(import.meta.url);
const Ajv2020 = loadDefault('ajv/dist/2020.js') as typeof Ajv2020Class;
const addFormats = loadDefault('ajv-formats') as FormatsPlugin;

describe('generated project schema', () => {
  it('matches the committed schema byte-for-byte', () => {
    const committed = readFileSync(resolve('schemas/projects.schema.json'), 'utf8');
    expect(committed).toBe(stringifyCanonical(buildProjectsJsonSchema()));
  });

  it('validates the generated projects document', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(buildProjectsJsonSchema());
    const projects: unknown = JSON.parse(buildOutputDocuments(fixtureInput()).projectsJson);
    expect(validate(projects), ajv.errorsText(validate.errors)).toBe(true);
  });
});

describe('generated command schemas', () => {
  it('match the option tables byte-for-byte', () => {
    for (const command of COMMAND_NAMES) {
      const committed = readFileSync(
        resolve(`schemas/commands/${command}.input.schema.json`),
        'utf8',
      );
      expect(committed).toBe(stringifyCanonical(buildCommandInputSchema(command)));
    }
  });
});

function loadDefault(moduleName: string): unknown {
  const loaded = require(moduleName) as { default?: unknown };
  return loaded.default ?? loaded;
}
