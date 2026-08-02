import { z } from 'zod';

export const providerSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/);
export const providerIdSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const nonEmptyStringSchema = z.string().min(1);
export const nullableStringSchema = z.string().nullable();
export const urlSchema = z.url();
export const nullableUrlSchema = urlSchema.nullable();
/**
 * RFC 3339, UTC, `Z`-suffixed, with each component bounded. Deliberately the same
 * pattern the contract's `result-envelope.schema.json` uses for its own timestamps:
 * a plugin's documents must not accept what the envelope they travel with would
 * reject. An unbounded `\d{2}` form admits `2026-99-99T99:99:99Z`.
 *
 * `:60` seconds is permitted because RFC 3339 allows a leap second. Month-specific
 * day counts and leap years are calendar rules a regular expression cannot express;
 * the contract leaves those to `format: date-time` and to conformance.
 */
const RFC3339_UTC =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:([0-5]\d|60)(\.\d{1,9})?Z$/;

export const nullableTimestampSchema = z
  .string()
  .regex(RFC3339_UTC, { message: 'Expected an RFC 3339 UTC timestamp' })
  .nullable();
export const timestampSchema = nullableTimestampSchema.unwrap();
export const nonNegativeIntegerSchema = z.number().int().min(0);
export const nullableNonNegativeIntegerSchema = nonNegativeIntegerSchema.nullable();

/**
 * Compares by UTF-16 code unit. **Never use `localeCompare` for anything that
 * reaches serialized output.** `localeCompare` resolves against the environment's
 * default locale, so its answer varies with `LANG` and with the ICU data a given
 * Node build ships — `'aa'.localeCompare('ab')` is -1 under `en` but +1 under
 * `da`, and mixed-case names such as `wisp` and `XML` invert entirely. Every
 * serialized ordering in this plugin flows through this function, because
 * byte-stability must not depend on who ran the command: determinism, cache
 * content hashing, and conformance C8 all rest on it.
 */
export function compareCodeUnits(a: string, b: string): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
