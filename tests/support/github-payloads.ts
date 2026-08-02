import { readFileSync } from 'node:fs';

const recordedRepository = JSON.parse(
  readFileSync(new URL('../fixtures/github/repositories/complete.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

export function repositoryPayload(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    ...structuredClone(recordedRepository),
    ...overrides,
  };
}
