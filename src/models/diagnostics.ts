import { z } from 'zod';

import { nullableStringSchema, nullableUrlSchema, nonEmptyStringSchema } from './primitives.js';

export const diagnosticSchema = z.object({
  code: nonEmptyStringSchema,
  message: nonEmptyStringSchema,
  resource: nullableUrlSchema,
  detail: nullableStringSchema,
  retryable: z.boolean(),
});

export type Diagnostic = z.infer<typeof diagnosticSchema>;
