import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import type { AnySchema } from 'ajv';
import type { Ajv2020 as Ajv2020Class } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';
import { parse } from 'yaml';

import { canonicalJson, type JsonValue } from '../src/serialization/canonical-json.js';
import { stringifyCanonicalYaml } from '../src/serialization/canonical-yaml.js';

const requireModule = createRequire(import.meta.url);

interface RuntimeManifest {
  readonly type: string;
  development?: boolean;
  digest?: string;
}

interface PluginManifest {
  readonly runtimes: RuntimeManifest[];
  readonly [key: string]: unknown;
}

export function materializeReleaseManifest(source: PluginManifest, digest: string): PluginManifest {
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) {
    throw new Error('A sha256 image digest is required.');
  }
  const manifest = structuredClone(source);
  const docker = manifest.runtimes.find(({ type }) => type === 'docker');
  if (docker === undefined) throw new Error('The plugin manifest has no Docker runtime.');
  for (const runtime of manifest.runtimes) runtime.development = false;
  docker.digest = digest;
  return manifest;
}

export function serializeReleaseManifest(manifest: PluginManifest): {
  readonly json: string;
  readonly yaml: string;
} {
  return {
    json: canonicalJson(manifest),
    yaml: stringifyCanonicalYaml(manifest as JsonValue),
  };
}

function main(): void {
  const [digest] = process.argv.slice(2);
  if (digest === undefined) throw new Error('A sha256 image digest is required.');
  writeReleaseArtifacts(resolve('.'), digest);
}

export function writeReleaseArtifacts(root: string, digest: string): void {
  const source = parse(readFileSync(resolve(root, 'plugin.yaml'), 'utf8')) as PluginManifest;
  const manifest = materializeReleaseManifest(source, digest);
  validateManifest(manifest, root);
  const serialized = serializeReleaseManifest(manifest);
  mkdirSync(resolve(root, 'release'), { recursive: true });
  mkdirSync(resolve(root, 'dist'), { recursive: true });
  writeFileSync(resolve(root, 'release/plugin.manifest.json'), serialized.json, 'utf8');
  writeFileSync(resolve(root, 'dist/plugin.manifest.json'), serialized.json, 'utf8');
  writeFileSync(resolve(root, 'plugin.yaml'), serialized.yaml, 'utf8');
}

function validateManifest(manifest: PluginManifest, root: string): void {
  const Ajv2020 = loadDefault('ajv/dist/2020.js') as typeof Ajv2020Class;
  const addFormats = loadDefault('ajv-formats') as FormatsPlugin;
  const schema = JSON.parse(
    readFileSync(resolve(root, 'schemas/contract/plugin-manifest.schema.json'), 'utf8'),
  ) as AnySchema;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(manifest)) {
    throw new Error(`Release manifest is invalid: ${ajv.errorsText(validate.errors)}`);
  }
}

function loadDefault(moduleName: string): unknown {
  const loaded: unknown = requireModule(moduleName);
  return typeof loaded === 'object' && loaded !== null && 'default' in loaded
    ? loaded.default
    : loaded;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
