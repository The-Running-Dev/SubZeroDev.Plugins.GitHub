import { describe, expect, it } from 'vitest';

import { contentHash, documentHash } from '../../src/cache/content-hash.js';
import { projectFixture } from '../support/project-fixture.js';

describe('cache content hashing', () => {
  it('ignores volatile closed issue and pull-request counts', () => {
    const first = projectFixture({ id: '1', closedIssues: 10, closedPullRequests: 2 });
    const second = projectFixture({ id: '1', closedIssues: 11, closedPullRequests: 3 });

    expect(contentHash(first)).toBe(contentHash(second));
    expect(documentHash(first)).not.toBe(documentHash(second));
  });

  it('includes stable repository content', () => {
    const first = projectFixture({ id: '1', stars: 10 });
    const second = projectFixture({ id: '1', stars: 11 });

    expect(contentHash(first)).not.toBe(contentHash(second));
  });
});
