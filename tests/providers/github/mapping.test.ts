import { describe, expect, it } from 'vitest';

import {
  githubRepositorySchema,
  mapRepository,
} from '../../../src/providers/github/mapping/repository.js';
import { repositoryPayload } from '../../support/github-payloads.js';

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
      topics: ['XML', 'wisp'],
    });
  });

  it('rejects provider shape drift before it becomes a domain model', () => {
    expect(() => githubRepositorySchema.parse(repositoryPayload({ id: '42' }))).toThrow();
  });
});
