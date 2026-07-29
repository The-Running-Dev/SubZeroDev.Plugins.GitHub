import { z } from 'zod';

export const SCHEMA_VERSION = '1.0.0' as const;

const schemaMajor = '1';

export const schemaVersionSchema = z
  .string()
  .regex(new RegExp(`^${schemaMajor}\\.[0-9]+\\.[0-9]+$`), {
    message: `Expected a compatible ${schemaMajor}.x schema version`,
  });

export type SchemaVersion = z.infer<typeof schemaVersionSchema>;
