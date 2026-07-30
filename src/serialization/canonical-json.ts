import { compareCodeUnits } from '../models/primitives.js';

/** Canonical JSON for signed and byte-compared artifacts: sorted keys, LF, one newline. */
export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value))}\n`;
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
