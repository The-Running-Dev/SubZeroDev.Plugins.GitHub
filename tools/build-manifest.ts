import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

import type { AnySchema } from 'ajv';
import type { Ajv2020 as Ajv2020Class } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';
import { parse } from 'yaml';

import { canonicalJson } from '../src/serialization/canonical-json.js';

const root = resolve(import.meta.dirname, '..');
const manifestPath = resolve(root, 'plugin.yaml');
const schemaPath = resolve(root, 'schemas/contract/plugin-manifest.schema.json');
const outputPath = resolve(root, 'dist/plugin.manifest.json');
const require = createRequire(import.meta.url);

function loadDefault(moduleName: string): unknown {
  const loaded: unknown = require(moduleName);
  if (typeof loaded === 'object' && loaded !== null && 'default' in loaded) {
    return loaded.default;
  }
  return loaded;
}

const Ajv2020 = loadDefault('ajv/dist/2020.js') as typeof Ajv2020Class;
const addFormats = loadDefault('ajv-formats') as FormatsPlugin;

const manifest: unknown = parse(readFileSync(manifestPath, 'utf8'));
const schema: unknown = JSON.parse(readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema as AnySchema);

if (!validate(manifest)) {
  const details = ajv.errorsText(validate.errors, { separator: '\n' });
  throw new Error(`plugin.yaml does not satisfy the vendored manifest schema:\n${details}`);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, canonicalJson(manifest), 'utf8');
