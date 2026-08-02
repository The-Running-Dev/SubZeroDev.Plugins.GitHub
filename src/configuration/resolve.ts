import { resolve } from 'node:path';

import type { Configuration } from './schema.js';

export interface ResolvedConfiguration extends Configuration {
  readonly directories: Configuration['directories'] & {
    readonly cache: string;
    readonly output: string;
  };
  readonly portfolio: Configuration['portfolio'] & { readonly overrides: string | null };
}

export function resolveConfiguration(
  configuration: Configuration,
  configurationDirectory: string,
): ResolvedConfiguration {
  return {
    ...configuration,
    directories: {
      ...configuration.directories,
      cache: resolve(configurationDirectory, configuration.directories.cache),
      output: resolve(configurationDirectory, configuration.directories.output),
    },
    portfolio: {
      overrides:
        configuration.portfolio.overrides === null
          ? null
          : resolve(configurationDirectory, configuration.portfolio.overrides),
    },
  };
}
