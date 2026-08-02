import { resolve } from 'node:path';

import { RepositoryCache } from '../src/cache/store.js';
import { nodeFileSystem } from '../src/services/node-file-system.js';
import { projectFixture } from '../tests/support/project-fixture.js';

const cache = new RepositoryCache(
  nodeFileSystem,
  resolve('tests/fixtures/cache/seeded'),
  () => 'seeded-cache',
);
await cache.write({
  owner: { provider: 'github', providerId: '99', login: 'fixture' },
  synchronizedAt: '2026-08-01T00:00:00Z',
  projects: [
    {
      project: projectFixture({ id: '1', stars: 7, commits: 42 }),
      resources: [],
      diagnostics: [],
      partial: false,
    },
  ],
});
