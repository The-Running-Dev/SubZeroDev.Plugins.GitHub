import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { parseProjectsDocument, projectSchema } from '../../src/models/index.js';

describe('project documents', () => {
  it('round-trips a complete provider-neutral project without a semantic change', () => {
    const parsed = projectSchema.parse(project);

    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
  });

  it('accepts a compatible schema minor version and rejects another major', () => {
    expect(projectSchema.parse({ ...project, schemaVersion: '1.4.2' }).schemaVersion).toBe('1.4.2');
    expect(() => projectSchema.parse({ ...project, schemaVersion: '2.0.0' })).toThrow(z.ZodError);
  });

  it('reports the invalid field path for a non-UTC timestamp', () => {
    try {
      projectSchema.parse({
        ...project,
        repository: { ...project.repository, createdAt: '2026-01-01T00:00:00+01:00' },
      });
      throw new Error('Expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(z.ZodError);
      expect((error as z.ZodError).issues[0]?.path).toEqual(['repository', 'createdAt']);
    }
  });

  it('reports a duplicate repository identity at the duplicate entry', () => {
    try {
      parseProjectsDocument({ schemaVersion: '1.0.0', projects: [project, project] });
      throw new Error('Expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(z.ZodError);
      expect((error as z.ZodError).issues[0]?.path).toEqual([
        'projects',
        1,
        'repository',
        'identity',
        'providerId',
      ]);
    }
  });
});

const project = {
  schemaVersion: '1.0.0',
  repository: {
    identity: { provider: 'github', providerId: '18446744073709551616' },
    owner: 'the-running-dev',
    name: 'Unicode project ✨',
    slug: 'the-running-dev/unicode-project',
    description: 'A complete fixture.',
    visibility: 'private',
    status: 'archived',
    isFork: true,
    isDisabled: false,
    isTemplate: true,
    createdAt: '2026-01-01T00:00:00.123Z',
    updatedAt: '2026-02-01T00:00:00Z',
    pushedAt: null,
    defaultBranch: 'main',
    homepageUrl: 'https://example.com',
    documentationUrl: 'https://example.com/docs',
    webUrl: 'https://github.com/the-running-dev/unicode-project',
    cloneUrl: 'https://github.com/the-running-dev/unicode-project.git',
    sshUrl: 'git@github.com:the-running-dev/unicode-project.git',
    topics: ['plugin', 'example'],
    license: 'MIT',
    primaryLanguage: 'TypeScript',
    capabilities: {
      issues: true,
      projects: true,
      wiki: false,
      pages: true,
      downloads: true,
      discussions: true,
    },
  },
  technology: {
    primaryLanguage: 'TypeScript',
    languages: [{ name: 'TypeScript', bytes: 100, percentage: 100 }],
  },
  statistics: {
    sizeKilobytes: 12,
    stars: 3,
    forks: 2,
    watchers: 4,
    commits: 5,
    branches: 1,
    tags: 1,
    issues: { open: 0, closed: 1 },
    pullRequests: { open: 0, closed: 1 },
  },
  releases: { total: 1, latest: null },
  contributors: { total: 1, truncated: false, contributors: [] },
  portfolio: {
    featured: true,
    hidden: false,
    displayName: null,
    summary: null,
    category: null,
    status: null,
    displayOrder: 1,
    technologies: ['TypeScript'],
    demoUrl: null,
    documentationUrl: 'https://example.com/docs',
    screenshots: [],
    businessRelevance: null,
    personalContribution: null,
    startedAt: null,
    endedAt: null,
    notes: null,
  },
  diagnostics: [],
};
