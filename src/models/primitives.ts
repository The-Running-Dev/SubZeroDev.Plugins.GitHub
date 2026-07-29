import { z } from 'zod';

export const providerSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/);
export const providerIdSchema = z.string().regex(/^[0-9]+$/);
export const nonEmptyStringSchema = z.string().min(1);
export const nullableStringSchema = z.string().nullable();
export const urlSchema = z.url();
export const nullableUrlSchema = urlSchema.nullable();
export const nullableTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/, {
    message: 'Expected an RFC 3339 UTC timestamp',
  })
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
