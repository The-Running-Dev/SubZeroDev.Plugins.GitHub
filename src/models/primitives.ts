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
