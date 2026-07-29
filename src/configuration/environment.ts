import { ConfigurationError } from './errors.js';

export interface ResolvedToken {
  readonly value: string;
  readonly source: 'environment' | 'gh-cli';
  readonly environmentVariable: string | null;
  readonly credentialPath: string | null;
}

export function resolveEnvironmentToken(
  environment: Readonly<NodeJS.ProcessEnv>,
  environmentVariable: string,
): ResolvedToken {
  const value = environment[environmentVariable];
  if (!value) {
    throw new ConfigurationError(`No token found in environment variable ${environmentVariable}`, [
      'auth',
      'tokenEnvironmentVariable',
    ]);
  }
  return { value, source: 'environment', environmentVariable, credentialPath: null };
}
