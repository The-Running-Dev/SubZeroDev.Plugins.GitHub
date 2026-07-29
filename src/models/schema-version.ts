import { z } from 'zod';

export const SCHEMA_VERSION = '1.0.0' as const;

const SCHEMA_MAJOR = '1';
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

export const schemaVersionSchema = z
  .string()
  .regex(new RegExp(`^${SCHEMA_MAJOR}\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$`), {
    message: `Expected a compatible ${SCHEMA_MAJOR}.x schema version`,
  });

export type SchemaVersion = z.infer<typeof schemaVersionSchema>;

/**
 * Why this exists alongside `schemaVersionSchema`: the schema answers "is this
 * acceptable", which is all a parse needs, but a reader must be able to tell an
 * *incompatible* document from an *unreadable* one. Those warrant different
 * messages — one says which version to regenerate from, the other says the value
 * is not a version at all — and below 1.0.0 there is no migration path, so the
 * actionable advice is "re-run `export`", which is only worth saying in the first
 * case.
 */
export type SchemaCompatibility =
  | { readonly kind: 'compatible'; readonly found: string }
  | { readonly kind: 'incompatible-major'; readonly found: string; readonly expected: string }
  | { readonly kind: 'unparseable'; readonly found: string };

/** Accepts the same major, refuses any other. Never throws — callers branch on `kind`. */
export function checkSchemaVersion(found: string): SchemaCompatibility {
  if (!SEMVER.test(found)) {
    return { kind: 'unparseable', found };
  }

  const major = found.slice(0, found.indexOf('.'));
  if (major !== SCHEMA_MAJOR) {
    return { kind: 'incompatible-major', found, expected: SCHEMA_VERSION };
  }

  return { kind: 'compatible', found };
}

/** One sentence naming both versions, so the message is actionable on its own. */
export function describeSchemaCompatibility(result: SchemaCompatibility): string {
  switch (result.kind) {
    case 'compatible':
      return `Schema version ${result.found} is compatible with ${SCHEMA_VERSION}.`;
    case 'incompatible-major':
      return `Schema version ${result.found} is incompatible with ${result.expected}; regenerate the document by re-running \`export\`.`;
    case 'unparseable':
      return `Schema version ${JSON.stringify(result.found)} is not a semantic version.`;
  }
}
