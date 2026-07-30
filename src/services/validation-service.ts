import type { CommandResult } from '../output/envelope.js';
import type { RepositoryProvider } from '../providers/provider.js';

/** Performs the zero-write readiness check used by the `validate` command. */
export async function validateProvider(provider: RepositoryProvider): Promise<CommandResult> {
  const access = await provider.checkAccess();
  if (!access.ok) {
    return {
      outcome: { kind: 'failed', exitCode: exitCodeFor(access.error.kind) },
      summary: 'GitHub access validation failed.',
      errors: [
        {
          code: access.error.code,
          message: access.error.message,
          retryable: access.error.retryable,
        },
      ],
    };
  }

  return {
    outcome: { kind: 'succeeded' },
    summary: `GitHub access is ready for ${access.value.login}.`,
    data: {
      login: access.value.login,
      ownerProviderId: access.value.ownerProviderId,
      tokenSource: access.value.tokenSource,
      cacheWritePerformed: false,
    },
  };
}

function exitCodeFor(
  kind:
    | 'unauthenticated'
    | 'forbidden'
    | 'rate-limited'
    | 'secondary-rate-limit'
    | 'not-found'
    | 'server-error'
    | 'network'
    | 'response-shape'
    | 'not-settled',
): 2 | 3 | 5 | 6 {
  if (kind === 'unauthenticated' || kind === 'forbidden') return 5;
  if (kind === 'rate-limited' || kind === 'secondary-rate-limit') return 6;
  return 3;
}
