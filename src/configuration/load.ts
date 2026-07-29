import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { ZodError } from 'zod';

import { ConfigurationError } from './errors.js';
import { configurationSchema, type Configuration } from './schema.js';

export interface LoadedConfiguration {
  readonly configuration: Configuration;
  readonly path: string;
  readonly directory: string;
}

export async function loadConfiguration(
  path: string,
  cwd = process.cwd(),
): Promise<LoadedConfiguration> {
  const absolutePath = resolve(cwd, path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(absolutePath, 'utf8'));
  } catch (error) {
    throw new ConfigurationError(
      `Could not read configuration at ${absolutePath}: ${error instanceof Error ? error.message : String(error)}`,
      [],
      'config_unreadable',
    );
  }

  try {
    return {
      configuration: configurationSchema.parse(parsed),
      path: absolutePath,
      directory: dirname(absolutePath),
    };
  } catch (error) {
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      const path = issue?.path ?? [];
      throw new ConfigurationError(
        `${absolutePath}: ${issue?.message ?? 'Configuration is invalid'}${
          path.length > 0 ? ` (at ${path.map(String).join('.')})` : ''
        }`,
        path,
        // A version this reader cannot accept is a different situation from a key it
        // does not recognise: only one of them is fixed by regenerating the file.
        path[0] === 'configVersion' ? 'config_version_unsupported' : 'config_invalid',
      );
    }
    throw error;
  }
}
