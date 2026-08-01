import { aggregateStatisticsSchema, type AggregateStatistics } from '../models/aggregate.js';
import type { Project } from '../models/project.js';

/** Aggregates only complete facts; one unavailable repository makes that portfolio total null. */
export function calculateAggregateStatistics(projects: readonly Project[]): AggregateStatistics {
  return aggregateStatisticsSchema.parse({
    repositories: {
      total: projects.length,
      public: projects.filter((project) => project.repository.visibility === 'public').length,
      private: projects.filter((project) => project.repository.visibility === 'private').length,
      archived: projects.filter((project) => project.repository.status === 'archived').length,
    },
    sizeKilobytes: sumComplete(projects.map((project) => project.statistics.sizeKilobytes)),
    stars: sumComplete(projects.map((project) => project.statistics.stars)),
    forks: sumComplete(projects.map((project) => project.statistics.forks)),
    watchers: sumComplete(projects.map((project) => project.statistics.watchers)),
    commits: sumComplete(projects.map((project) => project.statistics.commits)),
    branches: sumComplete(projects.map((project) => project.branches.total)),
    tags: sumComplete(projects.map((project) => project.tags.total)),
    releases: sumComplete(projects.map((project) => project.releases.total)),
    contributors: sumComplete(projects.map((project) => project.contributors.total)),
    issues: {
      open: sumComplete(projects.map((project) => project.statistics.issues.open)),
      closed: sumComplete(projects.map((project) => project.statistics.issues.closed)),
    },
    pullRequests: {
      open: sumComplete(projects.map((project) => project.statistics.pullRequests.open)),
      closed: sumComplete(projects.map((project) => project.statistics.pullRequests.closed)),
    },
  });
}

function sumComplete(values: readonly (number | null)[]): number | null {
  if (values.some((value) => value === null)) return null;
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}
