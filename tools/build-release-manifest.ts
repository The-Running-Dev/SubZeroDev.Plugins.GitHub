import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

import type { AnySchema } from 'ajv';
import type { Ajv2020 as Ajv2020Class } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';
import { parse } from 'yaml';

import { canonicalJson } from '../src/serialization/canonical-json.js';

const [digest] = process.argv.slice(2);
if (digest === undefined || !/^sha256:[a-f0-9]{64}$/.test(digest)) {
  throw new Error('A sha256 image digest is required.');
}
const manifest = parse(readFileSync(resolve('plugin.yaml'), 'utf8')) as {
  runtimes: { type: string; digest?: string; development?: boolean }[];
};
const docker = manifest.runtimes.find(({ type }) => type === 'docker');
if (docker === undefined) throw new Error('The plugin manifest has no Docker runtime.');
docker.digest = digest;
docker.development = false;
const require = createRequire(import.meta.url);
const Ajv2020 = loadDefault('ajv/dist/2020.js') as typeof Ajv2020Class;
const addFormats = loadDefault('ajv-formats') as FormatsPlugin;
const schema = JSON.parse(
  readFileSync(resolve('schemas/contract/plugin-manifest.schema.json'), 'utf8'),
) as AnySchema;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);
if (!validate(manifest)) {
  throw new Error(`Release manifest is invalid: ${ajv.errorsText(validate.errors)}`);
}
mkdirSync(resolve('release'), { recursive: true });
writeFileSync(resolve('release/plugin.manifest.json'), canonicalJson(manifest), 'utf8');

function loadDefault(moduleName: string): unknown {
  const loaded: unknown = require(moduleName);
  return typeof loaded === 'object' && loaded !== null && 'default' in loaded
    ? loaded.default
    : loaded;
}
