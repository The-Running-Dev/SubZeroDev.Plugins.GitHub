import { resolve } from 'node:path';
import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { RepositoryCache } from '../../src/cache/store.js';
import { runCliAsync } from '../../src/cli.js';
import { configurationSchema } from '../../src/configuration/schema.js';
import { resolveConfiguration } from '../../src/configuration/resolve.js';
import type { Logger } from '../../src/logging/logger.js';
import type { Project } from '../../src/models/project.js';
import type { CommandContext } from '../../src/services/command-context.js';
import type { FileSystemPort } from '../../src/services/ports.js';
import type {
  CollectionProfile,
  CollectionResult,
  DiscoveredRepository,
  RepositoryFilter,
  RepositoryProvider,
  RequestUsage,
  ResourceConditions,
} from '../../src/providers/provider.js';
import type { Outcome, ProviderError } from '../../src/providers/outcome.js';
import { sha256 } from '../../src/serialization/digest.js';
import type { ResultEnvelope } from '../../src/output/envelope.js';
import { memoryFileSystem } from '../support/fake-ports.js';
import { projectFixture } from '../support/project-fixture.js';

describe('CLI end-to-end service graph', () => {
  it('runs validate, sync, list, stats, and export with verified artifacts', async () => {
    const fileSystem = memoryFileSystem();
    const context = makeContext(fileSystem, new FixtureProvider([projectFixture({ id: '1' })]));

    for (const command of ['validate', 'sync', 'list', 'stats', 'export'] as const) {
      const { code, envelope } = await execute(command, context);
      expect(code).toBe(0);
      expect(envelope).toMatchObject({ command, status: 'succeeded', exitCode: 0 });
      if (command === 'export') {
        for (const artifact of envelope.artifacts) {
          const contents = fileSystem.read(resolve('fixture-root/output', artifact.path));
          expect(contents).toBeDefined();
          expect(new TextEncoder().encode(contents).byteLength).toBe(artifact.bytes);
          expect(sha256(contents ?? '')).toBe(artifact.sha256);
        }
      }
    }
  });

  it('reports invalid use as exit 2', async () => {
    const context = makeContext(memoryFileSystem(), new FixtureProvider([]));
    const result = await execute('sync', context, ['--profile', 'impossible']);
    expect(result).toMatchObject({ code: 2, envelope: { status: 'failed', exitCode: 2 } });
    expect(result.envelope.errors).not.toHaveLength(0);
  });

  it('reports authentication failure as exit 5', async () => {
    const provider = new FixtureProvider(
      [],
      providerError('unauthenticated', 'github_unauthenticated'),
    );
    const result = await execute('validate', makeContext(memoryFileSystem(), provider));
    expect(result).toMatchObject({ code: 5, envelope: { status: 'failed', exitCode: 5 } });
    expect(result.envelope.errors).not.toHaveLength(0);
  });

  it('reports a partial synchronization as exit 4', async () => {
    const provider = new FixtureProvider(
      [projectFixture({ id: '1' }), projectFixture({ id: '2' })],
      null,
      new Set(['2']),
    );
    const result = await execute('sync', makeContext(memoryFileSystem(), provider));
    expect(result).toMatchObject({ code: 4, envelope: { status: 'partial', exitCode: 4 } });
    expect(result.envelope.errors).not.toHaveLength(0);
  });

  it('reports rate limiting as exit 6', async () => {
    const provider = new FixtureProvider([], providerError('rate-limited', 'github_rate_limited'));
    const result = await execute('validate', makeContext(memoryFileSystem(), provider));
    expect(result).toMatchObject({ code: 6, envelope: { status: 'failed', exitCode: 6 } });
    expect(result.envelope.errors).not.toHaveLength(0);
  });

  it('reports corrupt cache as exit 3', async () => {
    const fileSystem = memoryFileSystem({
      [resolve('fixture-root/cache/manifest.json')]: '{ broken',
    });
    const result = await execute('list', makeContext(fileSystem, new FixtureProvider([])));
    expect(result).toMatchObject({ code: 3, envelope: { status: 'failed', exitCode: 3 } });
    expect(result.envelope.errors).not.toHaveLength(0);
  });

  it('reports export failure as exit 3', async () => {
    const base = memoryFileSystem();
    const cache = new RepositoryCache(base, resolve('fixture-root/cache'), () => 'seed');
    await cache.write({
      owner: { provider: 'github', providerId: '99', login: 'fixture' },
      synchronizedAt: '2026-08-01T00:00:00Z',
      projects: [cached(projectFixture({ id: '1' }))],
    });
    const failing: FileSystemPort = {
      ...base,
      writeFile: () => Promise.reject(new Error('injected export write failure')),
    };
    const result = await execute('export', makeContext(failing, new FixtureProvider([])));
    expect(result).toMatchObject({ code: 3, envelope: { status: 'failed', exitCode: 3 } });
    expect(result.envelope.errors).not.toHaveLength(0);
  });

  it('records zero writes for sync and export dry runs', async () => {
    const syncFs = memoryFileSystem();
    const syncContext = makeContext(syncFs, new FixtureProvider([projectFixture({ id: '1' })]));
    expect((await execute('sync', syncContext, ['--dry-run'])).code).toBe(0);
    expect(syncFs.writes).toEqual([]);
    expect(syncFs.renames).toEqual([]);

    const exportFs = memoryFileSystem();
    const exportContext = makeContext(exportFs, new FixtureProvider([projectFixture({ id: '1' })]));
    await execute('sync', exportContext);
    const writes = exportFs.writes.length;
    const renames = exportFs.renames.length;
    const result = await execute('export', exportContext, ['--dry-run']);
    expect(result.code).toBe(0);
    expect(result.envelope.artifacts).not.toHaveLength(0);
    expect(exportFs.writes).toHaveLength(writes);
    expect(exportFs.renames).toHaveLength(renames);
  });
});

async function execute(
  command: string,
  context: CommandContext,
  options: readonly string[] = [],
): Promise<{ code: number; envelope: ResultEnvelope }> {
  let output = '';
  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      output += String(chunk);
      callback();
    },
  });
  const code = await runCliAsync([command, '--json', ...options], {
    stdout,
    createContext: () => Promise.resolve(context),
    now: () => new Date('2026-08-01T00:00:00Z'),
  });
  return { code, envelope: JSON.parse(output) as ResultEnvelope };
}

function makeContext(fileSystem: FileSystemPort, provider: RepositoryProvider): CommandContext {
  const configuration = resolveConfiguration(
    configurationSchema.parse({ configVersion: '1.0.0' }),
    resolve('fixture-root'),
  );
  return {
    configuration,
    logger: quietLogger,
    fileSystem,
    cache: new RepositoryCache(fileSystem, configuration.directories.cache, () => 'run'),
    createProvider: () =>
      Promise.resolve({
        token: {
          value: 'test-token',
          source: 'environment',
          environmentVariable: 'GITHUB_TOKEN',
          credentialPath: null,
        },
        tokenNotes: [],
        provider,
      }),
  };
}

const quietLogger: Logger = {
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  child: () => quietLogger,
};

class FixtureProvider implements RepositoryProvider {
  public constructor(
    private readonly projects: readonly Project[],
    private readonly accessError: ProviderError | null = null,
    private readonly failures: ReadonlySet<string> = new Set(),
  ) {}

  public checkAccess(): Promise<
    Outcome<{ login: string; ownerProviderId: string; tokenSource: 'environment' }, ProviderError>
  > {
    return Promise.resolve(
      this.accessError === null
        ? {
            ok: true,
            value: { login: 'fixture', ownerProviderId: '99', tokenSource: 'environment' },
          }
        : { ok: false, error: this.accessError },
    );
  }

  public async *discover(
    filter: RepositoryFilter,
  ): AsyncIterable<Outcome<DiscoveredRepository, ProviderError>> {
    void filter;
    await Promise.resolve();
    for (const project of this.projects) {
      yield { ok: true, value: { repository: project.repository } };
    }
  }

  public collect(
    target: DiscoveredRepository,
    profile: CollectionProfile,
    conditions: ResourceConditions,
  ): Promise<Outcome<CollectionResult, ProviderError>> {
    void profile;
    void conditions;
    const id = target.repository.identity.providerId;
    if (this.failures.has(id)) {
      return Promise.resolve({
        ok: false,
        error: providerError('server-error', 'repository_collection_failed', `repository:${id}`),
      });
    }
    const project = this.projects.find(
      (candidate) => candidate.repository.identity.providerId === id,
    );
    if (project === undefined) throw new Error(`Missing fixture ${id}.`);
    return Promise.resolve({
      ok: true,
      value: {
        repository: project.repository,
        technology: project.technology,
        statistics: project.statistics,
        branches: project.branches,
        tags: project.tags,
        releases: project.releases,
        contributors: project.contributors,
        diagnostics: project.diagnostics,
        resources: [],
      },
    });
  }

  public usage(): RequestUsage {
    return { primaryRequests: 1, searchRequests: 0, notModifiedResponses: 0, retries: 0 };
  }
}

function providerError(
  kind: ProviderError['kind'],
  code: string,
  subject: string | null = null,
): ProviderError {
  return { kind, code, message: code, subject, retryable: false, status: null };
}

function cached(project: Project) {
  return { project, resources: [], diagnostics: [], partial: false } as const;
}
