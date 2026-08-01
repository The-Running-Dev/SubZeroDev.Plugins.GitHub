import type { LanguageStatistics } from '../../src/models/language.js';
import { projectSchema, type Project } from '../../src/models/project.js';

export interface ProjectFixtureOptions {
  readonly id: string;
  readonly visibility?: 'public' | 'private' | 'internal';
  readonly archived?: boolean;
  readonly createdAt?: string | null;
  readonly pushedAt?: string | null;
  readonly sizeKilobytes?: number | null;
  readonly stars?: number | null;
  readonly forks?: number | null;
  readonly watchers?: number | null;
  readonly commits?: number | null;
  readonly branches?: number | null;
  readonly tags?: number | null;
  readonly releases?: number | null;
  readonly contributors?: number | null;
  readonly openIssues?: number | null;
  readonly closedIssues?: number | null;
  readonly openPullRequests?: number | null;
  readonly closedPullRequests?: number | null;
  readonly languages?: readonly LanguageStatistics[];
}

export function projectFixture(options: ProjectFixtureOptions): Project {
  const slug = `fixture/repository-${options.id}`;
  return projectSchema.parse({
    schemaVersion: '1.0.0',
    repository: {
      identity: { provider: 'github', providerId: options.id },
      owner: 'fixture',
      name: `repository-${options.id}`,
      slug,
      description: null,
      visibility: options.visibility ?? 'public',
      status: options.archived === true ? 'archived' : 'active',
      isFork: false,
      isDisabled: false,
      isTemplate: false,
      createdAt: valueOrDefault(options.createdAt, '2026-01-01T00:00:00Z'),
      updatedAt: '2026-01-01T00:00:00Z',
      pushedAt: valueOrDefault(options.pushedAt, '2026-01-01T00:00:00Z'),
      defaultBranch: 'main',
      homepageUrl: null,
      documentationUrl: null,
      webUrl: `https://github.com/${slug}`,
      cloneUrl: `https://github.com/${slug}.git`,
      sshUrl: `git@github.com:${slug}.git`,
      topics: [],
      license: null,
      primaryLanguage: options.languages?.[0]?.name ?? null,
      capabilities: {
        issues: true,
        projects: false,
        wiki: false,
        pages: false,
        downloads: true,
        discussions: false,
      },
    },
    technology: {
      primaryLanguage: options.languages?.[0]?.name ?? null,
      languages: options.languages ?? [],
    },
    statistics: {
      sizeKilobytes: valueOrDefault(options.sizeKilobytes, 0),
      stars: valueOrDefault(options.stars, 0),
      forks: valueOrDefault(options.forks, 0),
      watchers: valueOrDefault(options.watchers, 0),
      commits: valueOrDefault(options.commits, 0),
      issues: {
        open: valueOrDefault(options.openIssues, 0),
        closed: valueOrDefault(options.closedIssues, 0),
      },
      pullRequests: {
        open: valueOrDefault(options.openPullRequests, 0),
        closed: valueOrDefault(options.closedPullRequests, 0),
      },
    },
    branches: { total: valueOrDefault(options.branches, 0), branches: [] },
    tags: { total: valueOrDefault(options.tags, 0), latest: null },
    releases: { total: valueOrDefault(options.releases, 0), latest: null },
    contributors: {
      total: valueOrDefault(options.contributors, 0),
      truncated: false,
      contributors: [],
    },
    portfolio: {
      featured: false,
      hidden: false,
      displayName: null,
      summary: null,
      category: null,
      status: null,
      displayOrder: null,
      technologies: [],
      demoUrl: null,
      documentationUrl: null,
      screenshots: [],
      businessRelevance: null,
      personalContribution: null,
      startedAt: null,
      endedAt: null,
      notes: null,
    },
    diagnostics: [],
  });
}

function valueOrDefault<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}
