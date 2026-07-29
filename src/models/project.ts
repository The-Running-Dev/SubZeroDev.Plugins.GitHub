import { z } from 'zod';

export const SCHEMA_VERSION = '1.0.0' as const;

export const projectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
});

export type Project = z.infer<typeof projectSchema>;
