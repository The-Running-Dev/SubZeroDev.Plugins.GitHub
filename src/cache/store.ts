import { join } from 'node:path';

import { z } from 'zod';

import { compareIdentity } from '../models/identity.js';
import { repositorySchema, type Repository } from '../models/repository.js';
import { timestampSchema } from '../models/primitives.js';
import { canonicalJson } from '../serialization/canonical-json.js';
import { mapConcurrent } from '../services/concurrency.js';
import type { FileSystemPort } from '../services/ports.js';

const cacheManifestSchema = z
  .object({
    cacheVersion: z.literal('1.0.0'),
    synchronizedAt: timestampSchema,
    repositoryIds: z.array(z.string().regex(/^[0-9]+$/)),
  })
  .strict();

type CacheManifest = z.infer<typeof cacheManifestSchema>;

export class CacheError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CacheError';
  }
}

/**
 * Minimal M3.5 cache: a manifest keyed by immutable GitHub IDs and one canonical
 * repository document per ID. M5 extends this with ETags and reconciliation.
 */
export class RepositoryCache {
  public constructor(
    private readonly fileSystem: FileSystemPort,
    private readonly directory: string,
  ) {}

  public async read(): Promise<{
    readonly synchronizedAt: string;
    readonly repositories: readonly Repository[];
  } | null> {
    const manifest = await this.readManifest();
    if (manifest === null) return null;

    const loaded = await mapConcurrent(
      manifest.repositoryIds,
      async (providerId) => {
        try {
          return await this.readJson(
            this.repositoryPath(providerId),
            repositorySchema,
            `repository ${providerId}`,
          );
        } catch (error: unknown) {
          if (isMissingFile(error)) {
            throw new CacheError(
              `Cache manifest references a missing repository ${providerId} document.`,
            );
          }
          throw error;
        }
      },
      { limit: 8 },
    );
    const failure = loaded.results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') {
      throw failure.reason instanceof Error
        ? failure.reason
        : new CacheError('Could not read repository documents from the cache.');
    }
    const repositories = loaded.results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    return {
      synchronizedAt: manifest.synchronizedAt,
      repositories: repositories.sort(compareRepositories),
    };
  }

  public async write(repositories: readonly Repository[], synchronizedAt: string): Promise<void> {
    const sorted = [...repositories].sort(compareRepositories);
    await this.fileSystem.mkdir(this.repositoriesDirectory(), { recursive: true });
    for (const repository of sorted) {
      await this.writeAtomically(this.repositoryPath(repository.identity.providerId), repository);
    }
    await this.writeAtomically(this.manifestPath(), {
      cacheVersion: '1.0.0',
      synchronizedAt,
      repositoryIds: sorted.map((repository) => repository.identity.providerId),
    } satisfies CacheManifest);
  }

  private async readManifest(): Promise<CacheManifest | null> {
    try {
      return await this.readJson(this.manifestPath(), cacheManifestSchema, 'cache manifest');
    } catch (error: unknown) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  private async readJson<T extends z.ZodType>(
    path: string,
    schema: T,
    description: string,
  ): Promise<z.output<T>> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(await this.fileSystem.readFile(path)));
    } catch (error: unknown) {
      if (isMissingFile(error)) throw error;
      throw new CacheError(`Could not read ${description} at ${path}.`);
    }
    const result = schema.safeParse(parsed);
    if (!result.success)
      throw new CacheError(
        `Invalid ${description} at ${path}: ${result.error.issues[0]?.message ?? 'unknown error'}`,
      );
    return result.data;
  }

  private async writeAtomically(path: string, value: unknown): Promise<void> {
    const stagingPath = `${path}.staging`;
    await this.fileSystem.writeFile(stagingPath, new TextEncoder().encode(canonicalJson(value)));
    await this.fileSystem.rename(stagingPath, path);
  }

  private manifestPath(): string {
    return join(this.directory, 'manifest.json');
  }

  private repositoriesDirectory(): string {
    return join(this.directory, 'repositories');
  }

  private repositoryPath(providerId: string): string {
    return join(this.repositoriesDirectory(), `${providerId}.json`);
  }
}

function compareRepositories(left: Repository, right: Repository): -1 | 0 | 1 {
  return compareIdentity(left.identity, right.identity);
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
