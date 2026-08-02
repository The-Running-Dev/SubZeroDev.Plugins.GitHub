import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  githubRepositorySchema,
  mapRepository,
} from '../../../src/providers/github/mapping/repository.js';

const fixtureRoot = fileURLToPath(new URL('../../fixtures/github/', import.meta.url));
const repositoryDirectory = `${fixtureRoot}/repositories`;
const errorDirectory = `${fixtureRoot}/errors`;
const paginationDirectory = `${fixtureRoot}/pagination`;

describe('recorded GitHub repository fixtures', () => {
  const names = readdirSync(repositoryDirectory)
    .filter((name) => name.endsWith('.json'))
    .sort();

  it('covers the required repository conditions', () => {
    expect(names).toEqual([
      'archived.json',
      'complete.json',
      'fork.json',
      'minimum.json',
      'private.json',
      'template.json',
      'unicode.json',
    ]);
  });

  it.each(names)('%s parses and maps through the provider boundary', (name) => {
    const source = githubRepositorySchema.parse(readJson(repositoryDirectory, name));
    const mapped = mapRepository(source);

    expect(mapped.identity).toEqual({ provider: 'github', providerId: String(source.id) });
    expect(JSON.stringify(mapped)).not.toContain('undefined');
  });
});

describe('recorded GitHub pagination fixtures', () => {
  it('forms a unique, terminated page sequence', () => {
    const pageSchema = z.array(githubRepositorySchema);
    const pages = ['page-1.json', 'page-2.json', 'page-3.json'].map((name) =>
      pageSchema.parse(readJson(paginationDirectory, name)),
    );
    const identities = pages.flat().map((repository) => repository.id);

    expect(pages.map((page) => page.length)).toEqual([2, 1, 0]);
    expect(new Set(identities).size).toBe(identities.length);
  });
});

describe('recorded GitHub error fixtures', () => {
  it('retains the generic public error-body shape without secrets', () => {
    const errorSchema = z
      .object({ message: z.string().min(1), documentation_url: z.url() })
      .loose();
    const names = readdirSync(errorDirectory).filter((name) => name.endsWith('.json'));

    expect(names).toHaveLength(5);
    for (const name of names) {
      const body = errorSchema.parse(readJson(errorDirectory, name));
      expect(JSON.stringify(body)).not.toMatch(/gh[pousr]_[A-Za-z0-9]+|bearer\s+/i);
    }
  });
});

function readJson(directory: string, name: string): unknown {
  return JSON.parse(readFileSync(`${directory}/${name}`, 'utf8')) as unknown;
}
