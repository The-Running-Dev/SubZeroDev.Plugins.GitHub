import { z } from 'zod';

import { compareCodeUnits, providerIdSchema, providerSchema } from './primitives.js';

export const projectIdentitySchema = z.object({
  provider: providerSchema,
  providerId: providerIdSchema,
});

export type ProjectIdentity = z.infer<typeof projectIdentitySchema>;

/** Numeric, so `'9'` orders before `'10'`. Operands are validated by their schema. */
export function compareProviderId(a: string, b: string): -1 | 0 | 1 {
  const left = BigInt(a);
  const right = BigInt(b);

  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function compareIdentity(a: ProjectIdentity, b: ProjectIdentity): -1 | 0 | 1 {
  const providerOrder = compareCodeUnits(a.provider, b.provider);
  if (providerOrder !== 0) return providerOrder;
  return compareProviderId(a.providerId, b.providerId);
}
