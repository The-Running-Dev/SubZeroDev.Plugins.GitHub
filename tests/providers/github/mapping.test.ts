import { describe, expect, it } from 'vitest';

import {
  githubRepositorySchema,
  mapRepository,
} from '../../../src/providers/github/mapping/repository.js';
import { repositoryPayload } from '../../support/github-payloads.js';

const map = (overrides: Readonly<Record<string, unknown>> = {}) =>
  mapRepository(githubRepositorySchema.parse(repositoryPayload(overrides)));

describe('GitHub repository mapping', () => {
  it('maps GitHub-only fields into the provider-neutral repository model', () => {
    const source = githubRepositorySchema.parse(
      repositoryPayload({ archived: true, topics: ['wisp', 'XML'], homepage: '' }),
    );
    const mapped = mapRepository(source, {
      documentationUrlTemplate: 'https://{owner}.github.io/{name}/',
    });

    expect(mapped).toMatchObject({
      identity: { provider: 'github', providerId: '42' },
      status: 'archived',
      homepageUrl: null,
      documentationUrl: 'https://octo.github.io/example/',
      // Code-unit order, so `XML` precedes `wisp` on every machine: under `da` a
      // locale-aware comparison inverts this pair.
      topics: ['XML', 'wisp'],
    });
  });

  it('rejects provider shape drift before it becomes a domain model', () => {
    expect(() => githubRepositorySchema.parse(repositoryPayload({ id: '42' }))).toThrow();
    expect(() =>
      githubRepositorySchema.parse(repositoryPayload({ visibility: 'semi-public' })),
    ).toThrow();
  });

  it('maps every absent optional field to null or an empty list, never to an absent key', () => {
    const omitted = ['node_id', 'visibility', 'topics', 'license'];
    const payload = Object.fromEntries(
      Object.entries(repositoryPayload()).filter(([key]) => !omitted.includes(key)),
    );
    const mapped = mapRepository(githubRepositorySchema.parse(payload));

    expect(mapped).toMatchObject({ visibility: 'public', topics: [], license: null });
    // `null` over omission is the serialization rule, so the absence has to survive
    // JSON: a key dropped here reads downstream as "not collected yet".
    expect(JSON.parse(JSON.stringify(mapped))).toMatchObject({ license: null, description: null });
  });

  it('derives visibility from `private` only when GitHub omits it', () => {
    expect(map({ visibility: 'internal', private: true }).visibility).toBe('internal');
    expect(map({ visibility: null, private: true }).visibility).toBe('private');
    expect(map({ visibility: null, private: false }).visibility).toBe('public');
  });

  it('reports an unidentified licence as null rather than as NOASSERTION', () => {
    expect(map({ license: { spdx_id: 'NOASSERTION', key: 'other' } }).license).toBeNull();
    expect(map({ license: { spdx_id: null, key: 'other' } }).license).toBeNull();
    expect(map({ license: null }).license).toBeNull();
    expect(map({ license: { spdx_id: 'Apache-2.0', key: 'apache-2.0' } }).license).toBe(
      'Apache-2.0',
    );
  });

  it('normalizes timestamps to UTC and drops unusable ones', () => {
    expect(map({ created_at: '2024-01-02T05:04:05+02:00' }).createdAt).toBe(
      '2024-01-02T03:04:05.000Z',
    );
    expect(map({ pushed_at: null }).pushedAt).toBeNull();
    expect(map({ pushed_at: 'never' }).pushedAt).toBeNull();
  });

  it('drops a homepage or documentation URL that is not a URL', () => {
    expect(map({ homepage: 'not a url' }).homepageUrl).toBeNull();
    expect(map({ homepage: 'https://example.test/x' }).homepageUrl).toBe('https://example.test/x');
    expect(
      mapRepository(githubRepositorySchema.parse(repositoryPayload()), {
        documentationUrlTemplate: '{owner}-{name}',
      }).documentationUrl,
    ).toBeNull();
  });

  it('carries GitHub capability flags across unchanged', () => {
    expect(map().capabilities).toEqual({
      issues: true,
      projects: false,
      wiki: true,
      pages: false,
      downloads: true,
      discussions: false,
    });
  });
});
