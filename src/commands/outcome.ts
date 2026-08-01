import type { CommandOutcome } from '../output/envelope.js';

export type FailureClass = 'usage' | 'operational' | 'authentication' | 'rate-limit';

export function failedOutcome(reason: FailureClass): Extract<CommandOutcome, { kind: 'failed' }> {
  switch (reason) {
    case 'usage':
      return { kind: 'failed', exitCode: 2 };
    case 'operational':
      return { kind: 'failed', exitCode: 3 };
    case 'authentication':
      return { kind: 'failed', exitCode: 5 };
    case 'rate-limit':
      return { kind: 'failed', exitCode: 6 };
  }
}

export function failureClassForCode(code: string | undefined): FailureClass {
  if (code?.startsWith('config_') === true) return 'usage';
  if (
    code === 'token_missing' ||
    code === 'github_unauthenticated' ||
    code === 'github_forbidden'
  ) {
    return 'authentication';
  }
  if (
    code === 'github_rate_limited' ||
    code === 'github_secondary_rate_limit' ||
    code === 'github_budget_stopped'
  ) {
    return 'rate-limit';
  }
  return 'operational';
}
