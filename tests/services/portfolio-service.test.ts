import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  applyPortfolioOverride,
  loadPortfolioOverrides,
} from '../../src/services/portfolio-service.js';
import { memoryFileSystem } from '../support/fake-ports.js';
import { projectFixture } from '../support/project-fixture.js';

describe('portfolio overrides', () => {
  it('matches by immutable provider ID and ignores the display slug', async () => {
    const path = resolve('portfolio.json');
    const fileSystem = memoryFileSystem({
      [path]: JSON.stringify({
        schemaVersion: '1.0.0',
        overrides: [
          {
            providerId: '42',
            slug: 'old/name',
            portfolio: { featured: true, displayName: 'Featured project' },
          },
        ],
      }),
    });
    const overrides = await loadPortfolioOverrides(fileSystem, path);
    const project = projectFixture({ id: '42' });
    project.repository.slug = 'new/name';

    expect(applyPortfolioOverride(project, overrides).portfolio).toMatchObject({
      featured: true,
      displayName: 'Featured project',
      hidden: false,
    });
  });

  it('refuses duplicate provider IDs', async () => {
    const path = resolve('portfolio.json');
    const fileSystem = memoryFileSystem({
      [path]: JSON.stringify({
        schemaVersion: '1.0.0',
        overrides: [
          { providerId: '7', portfolio: {} },
          { providerId: '7', portfolio: {} },
        ],
      }),
    });
    await expect(loadPortfolioOverrides(fileSystem, path)).rejects.toThrow(
      /duplicate provider ID 7/,
    );
  });
});
