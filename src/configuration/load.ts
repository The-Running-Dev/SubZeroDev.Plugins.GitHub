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
      throw new ConfigurationError(issue?.message ?? 'Configuration is invalid', issue?.path ?? []);
    }
    throw error;
  }
}
