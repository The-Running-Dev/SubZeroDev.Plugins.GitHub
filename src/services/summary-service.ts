import { compareIdentity, type ProjectIdentity } from '../models/identity.js';
import { distributeLanguagePercentages } from '../models/language.js';
import type { Project } from '../models/project.js';
import { summarySchema, type Summary } from '../models/summary.js';

export function calculateSummary(projects: readonly Project[]): Summary {
  const languageBytes = new Map<string, number>();
  for (const project of projects) {
    for (const language of project.technology.languages) {
      languageBytes.set(language.name, (languageBytes.get(language.name) ?? 0) + language.bytes);
    }
  }

  return summarySchema.parse({
    total: projects.length,
    public: projects.filter((project) => project.repository.visibility === 'public').length,
    private: projects.filter((project) => project.repository.visibility === 'private').length,
    archived: projects.filter((project) => project.repository.status === 'archived').length,
    languages: distributeLanguagePercentages(
      [...languageBytes].map(([name, bytes]) => ({ name, bytes })),
    ),
    stars: sumComplete(projects.map((project) => project.statistics.stars)),
    forks: sumComplete(projects.map((project) => project.statistics.forks)),
    releases: sumComplete(projects.map((project) => project.releases.total)),
    largest: select(projects, (project) => project.statistics.sizeKilobytes, 'maximum'),
    mostActive: selectTimestamp(projects, (project) => project.repository.pushedAt, 'maximum'),
    newest: selectTimestamp(projects, (project) => project.repository.createdAt, 'maximum'),
    oldest: selectTimestamp(projects, (project) => project.repository.createdAt, 'minimum'),
  });
}

function sumComplete(values: readonly (number | null)[]): number | null {
  if (values.some((value) => value === null)) return null;
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function select(
  projects: readonly Project[],
  value: (project: Project) => number | null,
  direction: 'minimum' | 'maximum',
): ProjectIdentity | null {
  const candidates = projects.filter((project) => value(project) !== null);
  candidates.sort((left, right) => {
    const leftValue = value(left) ?? 0;
    const rightValue = value(right) ?? 0;
    const comparison = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
    return comparison === 0
      ? compareIdentity(left.repository.identity, right.repository.identity)
      : direction === 'minimum'
        ? comparison
        : -comparison;
  });
  return candidates[0]?.repository.identity ?? null;
}

function selectTimestamp(
  projects: readonly Project[],
  value: (project: Project) => string | null,
  direction: 'minimum' | 'maximum',
): ProjectIdentity | null {
  return select(
    projects,
    (project) => {
      const timestamp = value(project);
      return timestamp === null ? null : Date.parse(timestamp);
    },
    direction,
  );
}
