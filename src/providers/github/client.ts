import { Octokit } from '@octokit/rest';

import type { Logger } from '../../logging/logger.js';
import type { ResolvedToken } from '../../configuration/environment.js';
import type { Clock, Sleeper } from '../../services/ports.js';

import { GitHubRequester } from './request.js';
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
}

/**
 * Keeps the Octokit dependency entirely inside the GitHub adapter.  Requests use
 * the thin transport below because it must retain 304 and 202 responses instead of
 * Octokit's usual throw-on-non-2xx behaviour.
 */
export interface GitHubClient {
  readonly octokit: Octokit;
  readonly requester: GitHubRequester;
  readonly baseUrl: string;
}

export function createGitHubClient(options: GitHubClientOptions): GitHubClient {
  const baseUrl = options.baseUrl ?? 'https://api.github.com';
  const fetch = options.fetch ?? globalThis.fetch;
  const octokit = new Octokit({ auth: options.token.value, baseUrl, userAgent: options.userAgent });
  const rateLimits = new RateLimitTracker(options.budget);
  return {
    octokit,
    requester: new GitHubRequester({
      fetch,
      token: options.token.value,
      userAgent: options.userAgent,
      logger: options.logger,
      sleeper: options.sleeper,
      clock: options.clock,
      rateLimits,
      ...(options.random === undefined ? {} : { random: options.random }),
    }),
    baseUrl,
  };
}
