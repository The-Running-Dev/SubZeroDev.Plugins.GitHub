import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCommandContext, type CommandContext } from '../../src/services/command-context.js';
import { listCachedRepositories } from '../../src/services/list-service.js';
import { synchronizeRepositories } from '../../src/services/sync-service.js';
import { validateProvider } from '../../src/services/validation-service.js';

const liveEnabled = process.env['SUBZERODEV_LIVE_TEST'] === '1';

describe.skipIf(!liveEnabled)('live GitHub account', () => {
  let directory: string;
  let context: CommandContext;

  beforeAll(async () => {
    if (!process.env['GITHUB_TOKEN']) {
      throw new Error('SUBZERODEV_LIVE_TEST=1 requires GITHUB_TOKEN.');
    }

    directory = mkdtempSync(join(tmpdir(), 'subzerodev-github-live-'));
    const configPath = join(directory, 'github.config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        configVersion: '1.0.0',
        repositories: { includePrivate: false },
        collection: { profile: 'basic' },
        directories: { cache: 'cache', output: 'output' },
        output: { formats: ['json'] },
      }),
    );
    context = await createCommandContext({ configPath, logLevel: 'error', quiet: true });
  });

  afterAll(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('validates, synchronizes core metadata, and lists the resulting cache', async () => {
    const providerContext = await context.createProvider();
    const validation = await validateProvider(providerContext.provider);

    expect(validation.outcome.kind).toBe('succeeded');
    expect(validation.data).toMatchObject({ cacheWritePerformed: false });

    const sync = await synchronizeRepositories({
      provider: providerContext.provider,
      cache: context.cache,
      filter: context.configuration.repositories,
      synchronizedAt: new Date().toISOString(),
    });
    expect(sync.outcome.kind).toBe('succeeded');
    expect(sync.data).toMatchObject({
      cacheWritePerformed: true,
      requestUsage: { searchRequests: 0, retries: 0 },
    });

    const list = await listCachedRepositories(context.cache);
    expect(list.outcome.kind).toBe('succeeded');
    expect(list.data?.['totalRepositories']).toBe(sync.data?.['discoveredRepositories']);
  });
});
