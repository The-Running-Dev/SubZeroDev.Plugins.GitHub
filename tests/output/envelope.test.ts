import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import type { AnySchema } from 'ajv';
import type { Ajv2020 as Ajv2020Class } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';
import { describe, expect, it } from 'vitest';

import { buildEnvelope, writeEnvelope } from '../../src/output/envelope.js';

const root = resolve(import.meta.dirname, '../..');
const schema: unknown = JSON.parse(
  readFileSync(resolve(root, 'schemas/contract/result-envelope.schema.json'), 'utf8'),
);
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
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema as AnySchema);

describe('result envelope', () => {
  it('maps a successful result to a contract-valid envelope and writes one document', () => {
    const envelope = buildEnvelope({
      command: 'manifest',
      pluginVersion: '0.1.0',
      startedAt: '2026-07-30T00:00:00Z',
      finishedAt: '2026-07-30T00:00:01Z',
      result: { outcome: { kind: 'succeeded' }, summary: 'Manifest printed.' },
    });
    let output = '';

    writeEnvelope(envelope, {
      write: (chunk: string) => {
        output += chunk;
        return true;
      },
    } as NodeJS.WritableStream);

    expect(validate(envelope), ajv.errorsText(validate.errors)).toBe(true);
    expect(JSON.parse(output)).toEqual(envelope);
    expect(output.endsWith('\n')).toBe(true);
  });

  it('omits oversized result data with an explicit warning', () => {
    const envelope = buildEnvelope({
      command: 'sync',
      pluginVersion: '0.1.0',
      startedAt: '2026-07-30T00:00:00Z',
      finishedAt: '2026-07-30T00:00:01Z',
      result: {
        outcome: { kind: 'succeeded' },
        summary: 'Synced.',
        data: { payload: 'x'.repeat(256 * 1024) },
      },
    });

    expect(envelope.data).toMatchObject({ dataOmitted: true });
    expect(envelope.warnings).toContainEqual(
      expect.objectContaining({ code: 'result_data_omitted' }),
    );
  });

  it('refuses a backwards timestamp range', () => {
    expect(() =>
      buildEnvelope({
        command: 'manifest',
        pluginVersion: '0.1.0',
        startedAt: '2026-07-30T00:00:01Z',
        finishedAt: '2026-07-30T00:00:00Z',
        result: { outcome: { kind: 'succeeded' }, summary: 'Manifest printed.' },
      }),
    ).toThrow('finishedAt');
  });

  it('refuses malformed timestamps and non-success results without errors', () => {
    expect(() =>
      buildEnvelope({
        command: 'sync',
        pluginVersion: '0.1.0',
        startedAt: '2026-02-30T00:00:00Z',
        finishedAt: '2026-02-30T00:00:01Z',
        result: { outcome: { kind: 'succeeded' }, summary: 'Synced.' },
      }),
    ).toThrow('valid RFC 3339 UTC timestamp');

    expect(() =>
      buildEnvelope({
        command: 'sync',
        pluginVersion: '0.1.0',
        startedAt: '2026-07-30T00:00:00Z',
        finishedAt: '2026-07-30T00:00:01Z',
        result: { outcome: { kind: 'partial' }, summary: 'Partially synced.' },
      }),
    ).toThrow('at least one error');
  });
});
