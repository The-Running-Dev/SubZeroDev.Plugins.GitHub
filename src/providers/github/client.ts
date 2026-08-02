import type { Logger } from '../../logging/logger.js';
import type { ResolvedToken } from '../../configuration/environment.js';
import type { Clock, Sleeper } from '../../services/ports.js';

import { GitHubRequester, type TransientRetryPolicy } from './request.js';
import { RateLimitTracker, type RequestBudget } from './rate-limit.js';

export interface GitHubClientOptions {
  readonly token: ResolvedToken;
  readonly logger: Logger;
  readonly sleeper: Sleeper;
  readonly clock: Clock;
  readonly budget: RequestBudget;
  readonly userAgent: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly random?: () => number;
  readonly baseUrl?: string;
  readonly transientRetry?: TransientRetryPolicy;
  readonly searchRequestsPerMinute?: number;
}

/**
 * The adapter talks to GitHub through `fetch` and its own request wrapper rather than
 * through Octokit — see
 * [ADR-003](../../../docs/docs/decisions/adr-003-request-wrapper-and-http-testing.md).
 * The wrapper has to *retain* `304` and `202` as outcomes, count requests per
 * rate-limit bucket, and read `Link` and rate-limit headers off every response;
 * Octokit throws on any non-2xx, so each of those would arrive as a caught error to
 * be reconstructed.
 */
export interface GitHubClient {
  readonly requester: GitHubRequester;
  readonly logger: Logger;
  readonly baseUrl: string;
}

export function createGitHubClient(options: GitHubClientOptions): GitHubClient {
  const baseUrl = options.baseUrl ?? 'https://api.github.com';
  const fetch = options.fetch ?? globalThis.fetch;
  const rateLimits = new RateLimitTracker(options.budget);
  return {
    logger: options.logger,
    baseUrl,
    requester: new GitHubRequester({
      fetch,
      token: options.token.value,
      userAgent: options.userAgent,
      logger: options.logger,
      sleeper: options.sleeper,
      clock: options.clock,
      rateLimits,
      ...(options.random === undefined ? {} : { random: options.random }),
      ...(options.transientRetry === undefined ? {} : { transientRetry: options.transientRetry }),
      ...(options.searchRequestsPerMinute === undefined
        ? {}
        : { searchRequestsPerMinute: options.searchRequestsPerMinute }),
    }),
  };
}
