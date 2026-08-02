import { readFileSync } from 'node:fs';

const recordedRepository = JSON.parse(
  readFileSync(new URL('../fixtures/github/repositories/complete.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

export function repositoryPayload(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    ...structuredClone(recordedRepository),
    size: 12,
    stargazers_count: 3,
    forks_count: 2,
    watchers_count: 4,
    open_issues_count: 5,
    ...overrides,
  };
}
