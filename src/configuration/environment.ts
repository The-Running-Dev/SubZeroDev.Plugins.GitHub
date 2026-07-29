import { registerSecret } from '../logging/secret-registry.js';

import { ConfigurationError } from './errors.js';
import type { GhCliCredentialSource } from './gh-cli-credentials.js';

/**
 * `source` is required, not optional, so a token's provenance is structural. The
 * specification requires `gh` CLI reuse to be *recorded* and never a silent
 * fallback; a field that must be populated is what makes that true by construction
 * rather than by remembering to log it.
 */
export interface ResolvedToken {
  readonly value: string;
  readonly source: 'environment' | 'gh-cli';
  readonly environmentVariable: string | null;
  readonly credentialPath: string | null;
}

export interface TokenResolution {
  readonly token: ResolvedToken;
  /** Surfaced by `validate` and the run report. Never contains the value. */
  readonly notes: readonly string[];
}

export interface ResolveTokenOptions {
  readonly environment: Readonly<NodeJS.ProcessEnv>;
  readonly environmentVariable: string;
  readonly allowGhCliTokenReuse: boolean;
  readonly ghCli?: GhCliCredentialSource;
}

/**
 * Resolution order: the configured environment variable, then — only when enabled —
 * `gh`'s stored credential, then refuse.
 *
 * The environment always wins. Someone who exported a token meant that token, and
 * silently preferring a broader `gh` session would widen access beyond what the
 * manifest declared.
 *
 * Registers the resolved value for redaction here, at the single point where a token
 * enters the process, so nothing downstream has to thread the value through the call
 * graph just to keep it out of a log record.
 */
export async function resolveToken(options: ResolveTokenOptions): Promise<TokenResolution> {
  const { environment, environmentVariable, allowGhCliTokenReuse, ghCli } = options;

  const fromEnvironment = environment[environmentVariable];
  if (fromEnvironment !== undefined && fromEnvironment.length > 0) {
    return {
      token: arm({
        value: fromEnvironment,
        source: 'environment',
        environmentVariable,
        credentialPath: null,
      }),
      notes: [],
    };
  }

  if (!allowGhCliTokenReuse || ghCli === undefined) {
    throw new ConfigurationError(
      `No token found in environment variable ${environmentVariable}.`,
      ['auth', 'tokenEnvironmentVariable'],
      'token_missing',
    );
  }

  const credential = await ghCli.read();
  if (credential === null) {
    // Named rather than silent: reuse was asked for and could not be honoured, and
    // saying so is the difference between "misconfigured" and "not logged in".
    throw new ConfigurationError(
      `No token found in environment variable ${environmentVariable}, and GitHub CLI token reuse is enabled but no credential was found. Set ${environmentVariable}, or run \`gh auth login\`.`,
      ['auth', 'allowGhCliTokenReuse'],
      'token_missing',
    );
  }

  return {
    token: arm({
      value: credential.token,
      source: 'gh-cli',
      environmentVariable: null,
      credentialPath: credential.configPath,
    }),
    notes: [
      `Token reused from the GitHub CLI credential at ${credential.configPath}. It carries whatever scopes that session holds, which is usually broader than this plugin needs.`,
    ],
  };
}

function arm(token: ResolvedToken): ResolvedToken {
  registerSecret(token.value);
  return token;
}
