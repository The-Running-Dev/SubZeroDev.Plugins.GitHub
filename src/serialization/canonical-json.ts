import { compareCodeUnits } from '../models/primitives.js';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** Canonical JSON for signed and byte-compared artifacts: sorted keys, LF, one newline. */
export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value))}\n`;
}

/** Human-readable canonical JSON used by exported and generated documents. */
export function stringifyCanonical(value: JsonValue): string {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}

export function sortKeysDeep(value: JsonValue): JsonValue {
  if (Array.isArray(value))
    return (value as readonly JsonValue[]).map((entry) => sortKeysDeep(entry));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([key, entry]) => [key, sortKeysDeep(entry)]),
  );
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}
