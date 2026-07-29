import { z } from 'zod';

import { providerIdSchema, providerSchema } from './primitives.js';

export const projectIdentitySchema = z.object({
  provider: providerSchema,
  providerId: providerIdSchema,
});

export type ProjectIdentity = z.infer<typeof projectIdentitySchema>;

export function compareProviderId(a: string, b: string): -1 | 0 | 1 {
  const left = BigInt(providerIdSchema.parse(a));
  const right = BigInt(providerIdSchema.parse(b));

  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function compareIdentity(a: ProjectIdentity, b: ProjectIdentity): -1 | 0 | 1 {
  const providerOrder = a.provider.localeCompare(b.provider);
  if (providerOrder < 0) return -1;
  if (providerOrder > 0) return 1;
  return compareProviderId(a.providerId, b.providerId);
}
