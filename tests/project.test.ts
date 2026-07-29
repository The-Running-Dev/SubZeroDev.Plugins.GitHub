import { describe, expect, it } from 'vitest';

import { projectSchema, SCHEMA_VERSION } from '../src/models/project.js';

describe('project schema', () => {
  it('accepts a versioned provider-independent project', () => {
    const project = projectSchema.parse(minimumProject);

    expect(project.repository.name).toBe('Example');
  });

  it('rejects an unsupported schema version', () => {
    expect(() => projectSchema.parse({ ...minimumProject, schemaVersion: '2.0.0' })).toThrow();
  });
});

const minimumProject = {
  schemaVersion: SCHEMA_VERSION,
  repository: {
    identity: { provider: 'github', providerId: '123' },
    owner: 'the-running-dev',
    name: 'Example',
    slug: 'the-running-dev/example',
    description: null,
    visibility: 'public',
    status: 'active',
    isFork: false,
    isDisabled: false,
    isTemplate: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    pushedAt: null,
    defaultBranch: 'main',
    homepageUrl: null,
    documentationUrl: null,
    webUrl: 'https://github.com/the-running-dev/example',
    cloneUrl: 'https://github.com/the-running-dev/example.git',
    sshUrl: 'git@github.com:the-running-dev/example.git',
    topics: [],
    license: null,
    primaryLanguage: null,
    capabilities: {
      issues: true,
      projects: false,
      wiki: false,
      pages: false,
      downloads: true,
      discussions: false,
    },
  },
  technology: { primaryLanguage: null, languages: [] },
  statistics: {
    sizeKilobytes: 0,
    stars: 0,
    forks: 0,
    watchers: 0,
    commits: null,
    branches: null,
    tags: null,
    issues: { open: null, closed: null },
    pullRequests: { open: null, closed: null },
  },
  releases: { total: null, latest: null },
  contributors: { total: null, truncated: false, contributors: [] },
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
};
