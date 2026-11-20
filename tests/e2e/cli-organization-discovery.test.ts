import { resolve } from 'node:path';
import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { RepositoryCache } from '../../src/cache/store.js';
import { runCliAsync } from '../../src/cli.js';
import { configurationSchema } from '../../src/configuration/schema.js';
import { resolveConfiguration } from '../../src/configuration/resolve.js';
import type { Logger } from '../../src/logging/logger.js';
import type { ResultEnvelope } from '../../src/output/envelope.js';
import { GitHubProvider } from '../../src/providers/github/github-provider.js';
import type { CommandContext } from '../../src/services/command-context.js';
import {
  fakeClock,
  fakeSleeper,
  memoryFileSystem,
  type MemoryFileSystem,
} from '../support/fake-ports.js';
import { createFetchStub, type FetchStub, type StubRoute } from '../support/fetch-stub.js';
import { repositoryPayload } from '../support/github-payloads.js';

/**
 * Drives the real CLI entry point and the real GitHub provider against a stubbed API,
 * so configuration parsing, discovery, collection, the cache, and export all run unchanged.
 */
describe('CLI organization discovery', () => {
  it('syncs and exports owned and organization repositories once each, private ones included', async () => {
    const fileSystem = memoryFileSystem();
    const stub = github({
      owned: [
        ...listing('octo', 1, 2),
        repositoryPayload({ id: 900, name: 'shared', full_name: 'octo/shared' }),
      ],
      organizations: {
        AbsoluteZeroDev: [
          ...listing('AbsoluteZeroDev', 1000, 149),
          repositoryPayload({
            id: 900,
            name: 'shared',
            full_name: 'AbsoluteZeroDev/shared',
            owner: { login: 'AbsoluteZeroDev', id: 77 },
          }),
          repositoryPayload({
            id: 2000,
            name: 'private-tool',
            full_name: 'AbsoluteZeroDev/private-tool',
            private: true,
            visibility: 'private',
          }),
        ],
      },
    });
    const context = makeContext(fileSystem, stub, { organizations: ['AbsoluteZeroDev'] });

    expect((await execute('validate', context)).code).toBe(0);
    const sync = await execute('sync', context, ['--profile', 'basic']);
    expect(sync).toMatchObject({
      code: 0,
      envelope: {
        status: 'succeeded',
        data: {
          discoveredRepositories: 153,
          cachedRepositories: 153,
          discoveryScope: { scope: 'owned', organizations: ['AbsoluteZeroDev'] },
          cacheWritePerformed: true,
        },
      },
    });
    const organizationPages = stub.requests
      .filter((request) => request.url.pathname === '/orgs/AbsoluteZeroDev/repos')
      .map((request) => request.url.searchParams.get('page'));
    expect(organizationPages).toEqual(['1', '2']);

    const exported = await execute('export', context);
    expect(exported.code).toBe(0);
    const projects = exportedProjects(fileSystem, exported.envelope);
    const ids = projects.map((project) => project.repository.identity.providerId);
    expect(ids).toHaveLength(153);
    expect(new Set(ids).size).toBe(153);
    expect(ids.every((id) => /^\d+$/.test(id))).toBe(true);
    const shared = projects.filter((project) => project.repository.identity.providerId === '900');
    expect(shared.map((project) => project.repository.slug)).toEqual(['octo/shared']);
    expect(
      projects.find((project) => project.repository.identity.providerId === '2000')?.repository,
    ).toMatchObject({ slug: 'AbsoluteZeroDev/private-tool', visibility: 'private' });
    expect(JSON.stringify(exported.envelope)).not.toContain('token-canary-value');
  });

  for (const denial of [
    { status: 403, code: 'github_organization_forbidden' },
    { status: 404, code: 'github_organization_not_found' },
  ] as const) {
    it(`reports a denied organization (${String(denial.status)}) as partial and keeps the cache`, async () => {
      const fileSystem = memoryFileSystem();
      const owned = listing('octo', 1, 2);
      const first = makeContext(fileSystem, github({ owned, organizations: {} }));
      expect((await execute('sync', first, ['--profile', 'basic'])).code).toBe(0);
      const cacheBefore = cacheFiles(fileSystem);

      const denied = makeContext(
        fileSystem,
        github({ owned, organizations: {}, denied: { login: 'Locked', status: denial.status } }),
        { organizations: ['Locked'] },
      );
      const result = await execute('sync', denied, ['--profile', 'basic']);

      expect(result).toMatchObject({
        code: 4,
        envelope: {
          status: 'partial',
          exitCode: 4,
          data: {
            discoveredRepositories: 2,
            discoveryScope: { scope: 'owned', organizations: ['Locked'] },
            cacheWritePerformed: false,
          },
          errors: [{ code: denial.code }],
        },
      });
      expect(JSON.stringify(result.envelope)).not.toContain('token-canary-value');
      expect(cacheFiles(fileSystem)).toEqual(cacheBefore);
    });
  }

  it('fails with exit 3, not an authentication exit, when only a denied organization was listed', async () => {
    const result = await execute(
      'sync',
      makeContext(
        memoryFileSystem(),
        github({ owned: [], organizations: {}, denied: { login: 'Locked', status: 403 } }),
        { organizations: ['Locked'] },
      ),
      ['--profile', 'basic'],
    );

    expect(result).toMatchObject({
      code: 3,
      envelope: {
        status: 'failed',
        exitCode: 3,
        data: { discoveredRepositories: 0, cacheWritePerformed: false },
        errors: [{ code: 'github_organization_forbidden' }],
      },
    });
  });

  it('fails an organization listing that breaks partway without writing the cache', async () => {
    const fileSystem = memoryFileSystem();
    const stub = github({
      owned: [],
      organizations: { Flaky: listing('Flaky', 1, 100) },
      failPage: { login: 'Flaky', page: 2, status: 502 },
    });
    const result = await execute(
      'sync',
      makeContext(fileSystem, stub, { organizations: ['Flaky'] }),
      ['--profile', 'basic'],
    );

    expect(result).toMatchObject({
      code: 4,
      envelope: {
        status: 'partial',
        data: { discoveredRepositories: 100, cacheWritePerformed: false },
      },
    });
    expect(cacheFiles(fileSystem)).toEqual([]);
  });

  it('keeps an unchanged configuration to owned repositories alone', async () => {
    const fileSystem = memoryFileSystem();
    const stub = github({ owned: listing('octo', 1, 3), organizations: {} });
    const result = await execute('sync', makeContext(fileSystem, stub), ['--profile', 'basic']);

    expect(result).toMatchObject({
      code: 0,
      envelope: {
        data: {
          discoveredRepositories: 3,
          discoveryScope: { scope: 'owned', organizations: [] },
        },
      },
    });
    expect(stub.requests.some((request) => request.url.pathname.startsWith('/orgs/'))).toBe(false);
  });
});

interface ExportedProject {
  readonly repository: {
    readonly slug: string;
    readonly visibility: string;
    readonly identity: { readonly providerId: string };
  };
}

function exportedProjects(
  fileSystem: MemoryFileSystem,
  envelope: ResultEnvelope,
): ExportedProject[] {
  const artifact = envelope.artifacts.find((candidate) => candidate.path.endsWith('.json'));
  const contents = artifact && fileSystem.read(resolve('fixture-root/output', artifact.path));
  if (contents === undefined) throw new Error('The export wrote no JSON artifact.');
  const document = JSON.parse(contents) as { projects: ExportedProject[] };
  return document.projects;
}

function cacheFiles(fileSystem: MemoryFileSystem): string[] {
  const root = resolve('fixture-root/cache');
  return fileSystem.writes
    .filter((path) => path.startsWith(root))
    .map((path) => `${path}:${fileSystem.read(path) ?? ''}`)
    .sort();
}

function listing(owner: string, firstId: number, count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) =>
    repositoryPayload({
      id: firstId + index,
      name: `${owner}-${String(index + 1)}`,
      full_name: `${owner}/${owner}-${String(index + 1)}`,
      owner: { login: owner, id: firstId },
    }),
  );
}

function github(input: {
  readonly owned: readonly Record<string, unknown>[];
  readonly organizations: Readonly<Record<string, readonly Record<string, unknown>[]>>;
  readonly denied?: { readonly login: string; readonly status: number };
  readonly failPage?: { readonly login: string; readonly page: number; readonly status: number };
}): FetchStub {
  const paged =
    (all: readonly Record<string, unknown>[], login?: string): StubRoute['respond'] =>
    (request) => {
      const page = Number(request.url.searchParams.get('page') ?? '1');
      const perPage = Number(request.url.searchParams.get('per_page') ?? '100');
      if (input.failPage?.login === login && input.failPage?.page === page) {
        return { status: input.failPage.status, body: { message: 'Bad Gateway' } };
      }
      return { status: 200, body: all.slice((page - 1) * perPage, page * perPage) };
    };
  const routes: StubRoute[] = [
    {
      method: 'GET',
      pathPattern: /^\/user$/,
      respond: () => ({ status: 200, body: { login: 'octo', id: 99 } }),
    },
    { method: 'GET', pathPattern: /^\/user\/repos\?/, respond: paged(input.owned) },
    ...Object.entries(input.organizations).map(([login, all]): StubRoute => ({
      method: 'GET',
      pathPattern: new RegExp(`^/orgs/${login}/repos\\?`),
      respond: paged(all, login),
    })),
  ];
  if (input.denied !== undefined) {
    const { login, status } = input.denied;
    routes.push({
      method: 'GET',
      pathPattern: new RegExp(`^/orgs/${login}/repos\\?`),
      respond: () => ({ status, body: { message: status === 404 ? 'Not Found' : 'Forbidden' } }),
    });
  }
  return createFetchStub(routes);
}

function makeContext(
  fileSystem: MemoryFileSystem,
  stub: FetchStub,
  repositories: Record<string, unknown> = {},
): CommandContext {
  const configuration = resolveConfiguration(
    configurationSchema.parse({ configVersion: '1.0.0', repositories }),
    resolve('fixture-root'),
  );
  const token = {
    value: 'token-canary-value',
    source: 'environment',
    environmentVariable: 'GITHUB_TOKEN',
    credentialPath: null,
  } as const;
  return {
    configuration,
    logger: quietLogger,
    fileSystem,
    cache: new RepositoryCache(fileSystem, configuration.directories.cache, () => 'run'),
    createProvider: () =>
      Promise.resolve({
        token,
        tokenNotes: [],
        provider: new GitHubProvider({
          token,
          logger: quietLogger,
          sleeper: fakeSleeper(),
          clock: fakeClock(),
          budget: { warnAtPercentConsumed: 50, stopAtPercentConsumed: 90 },
          userAgent: 'test-agent',
          fetch: stub.fetch,
          baseUrl: 'https://example.test',
          retainRawResponses: false,
        }),
      }),
  };
}

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

const quietLogger: Logger = {
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  child: () => quietLogger,
};
