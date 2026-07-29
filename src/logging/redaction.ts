import { registeredSecrets } from './secret-registry.js';

export function scrubSecrets(value: string): string {
  return registeredSecrets().reduce(
    (scrubbed, secret) =>
      scrubbed
        .replaceAll(secret, '[redacted]')
        .replaceAll(encodeURIComponent(secret), '[redacted]'),
    value,
  );
}

export function sanitizeError(error: unknown): { readonly name: string; readonly message: string } {
  if (error instanceof Error) return { name: error.name, message: scrubSecrets(error.message) };
  return { name: 'Error', message: scrubSecrets(String(error)) };
}
