import type { Logger } from '../../logging/logger.js';
import type { Clock, Sleeper } from '../../services/ports.js';
import type { Outcome, ProviderError, ProviderErrorKind } from '../outcome.js';
import type { ResourceObservation } from '../provider.js';

import { classifyHttpError, providerError } from './errors.js';
import { parseLastPage } from './link-header.js';
import type { RateLimitBucket, RateLimitTracker } from './rate-limit.js';
import type { ResourceKey } from './resource-keys.js';
import { parseRetryAfterMilliseconds } from './retry-after.js';
import { SearchRequestPacer } from './search-pacer.js';

export interface RequestSpec {
  readonly resource: ResourceKey;
  readonly url: string;
  readonly bucket: RateLimitBucket;
  readonly etag?: string | null;
  readonly acceptNotModified?: boolean;
  readonly settleRetry?: { readonly attempts: number; readonly baseMilliseconds: number };
  readonly subject?: string | null;
}

export interface GitHubResponse<T> {
  readonly status: number;
  readonly notModified: boolean;
  readonly etag: string | null;
  readonly data: T | null;
  readonly linkLastPage: number | null;
}

/**
 * Bounded exponential backoff with full jitter for `5xx` and network failures only.
 * Rate limiting is deliberately **not** retried: the budget rule is warn at 50% and
 * stop cleanly at 90% reporting partial success, which is the opposite of sleeping
 * until the window resets, and is why `@octokit/plugin-throttling` was rejected
 * (`IMPLEMENTATION-PLAN.md` §1.2). Every request this plugin issues is a `GET`, so
 * the usual non-idempotent-retry hazard does not apply.
 */
export interface TransientRetryPolicy {
  readonly attempts: number;
  readonly baseMilliseconds: number;
  /**
   * Also the ceiling on an honoured `Retry-After`. A server asking for longer than
   * this gets the request abandoned rather than shortened — waiting less than we were
   * told to is how a client earns a secondary rate limit.
   */
  readonly maximumDelayMilliseconds: number;
}

const DEFAULT_TRANSIENT_RETRY: TransientRetryPolicy = {
  attempts: 2,
  baseMilliseconds: 500,
  maximumDelayMilliseconds: 15_000,
};

const TRANSIENT_KINDS: readonly ProviderErrorKind[] = ['server-error', 'network'];

export interface GitHubRequesterOptions {
  readonly fetch: typeof globalThis.fetch;
  readonly token: string;
  readonly userAgent: string;
  readonly logger: Logger;
  readonly sleeper: Sleeper;
  readonly clock: Clock;
  readonly rateLimits: RateLimitTracker;
  readonly random?: () => number;
  readonly transientRetry?: TransientRetryPolicy;
  readonly searchRequestsPerMinute?: number;
}

/** `once` also reports what the response asked us to wait; the retry decision is not its job. */
interface Attempt<T> {
  readonly outcome: Outcome<GitHubResponse<T>, ProviderError>;
  readonly retryAfterMilliseconds: number | null;
}

export class GitHubRequester {
  private readonly random: () => number;
  private readonly searchPacer: SearchRequestPacer;
  private readonly transientRetry: TransientRetryPolicy;
  private readonly observations = new Map<
    ResourceKey,
    ResourceObservation & { readonly subject: string | null }
  >();

  public constructor(private readonly options: GitHubRequesterOptions) {
    this.random = options.random ?? Math.random;
    this.transientRetry = options.transientRetry ?? DEFAULT_TRANSIENT_RETRY;
    this.searchPacer = new SearchRequestPacer(
      options.searchRequestsPerMinute ?? 20,
      options.clock,
      options.sleeper,
    );
  }

  public async get<T>(
    spec: RequestSpec,
    parse: (value: unknown) => T,
  ): Promise<Outcome<GitHubResponse<T>, ProviderError>> {
    const settleAttempts = spec.settleRetry?.attempts ?? 0;
    for (let attempt = 0; ; attempt += 1) {
      const attempted = await this.withTransientRetry(spec, parse);
      if (!attempted.outcome.ok || attempted.outcome.value.status !== 202) return attempted.outcome;

      // A 202 is never data, and it is never `ok` either: the caller would have to
      // remember to test `status` to tell "still computing" from "nothing there", and
      // one forgotten check publishes an empty statistic as a real one.
      const delay =
        attempt >= settleAttempts
          ? null
          : this.backoffDelay(
              attempt,
              attempted.retryAfterMilliseconds,
              spec.settleRetry?.baseMilliseconds ?? 0,
            );
      if (delay === null) {
        return {
          ok: false,
          error: providerError(
            'not-settled',
            'github_statistics_not_settled',
            'GitHub was still computing these statistics after the retry budget was spent.',
            {
              subject: spec.subject ?? null,
              status: 202,
              // A later run can succeed unchanged — unlike response-shape drift, this
              // needs time, not a code change.
              retryable: true,
            },
          ),
        };
      }

      this.options.rateLimits.recordRetry();
      this.options.logger.debug('GitHub statistics are still being computed; retrying.', {
        resource: spec.resource,
        attempt: attempt + 1,
        delay,
      });
      await this.options.sleeper.sleep(delay);
    }
  }

  public usage() {
    return this.options.rateLimits.usage();
  }

  public observationsForSubject(subject: string): readonly ResourceObservation[] {
    return [...this.observations.values()]
      .filter((observation) => observation.subject === subject)
      .map(({ key, etag, fetchedAt }) => ({ key, etag, fetchedAt }))
      .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  }

  /** Returns the whole `Attempt`, so the settle loop above can honour `Retry-After` too. */
  private async withTransientRetry<T>(
    spec: RequestSpec,
    parse: (value: unknown) => T,
  ): Promise<Attempt<T>> {
    for (let attempt = 0; ; attempt += 1) {
      const attempted = await this.once(spec, parse);
      if (attempted.outcome.ok || attempt >= this.transientRetry.attempts) return attempted;
      if (!TRANSIENT_KINDS.includes(attempted.outcome.error.kind)) return attempted;

      const delay = this.backoffDelay(
        attempt,
        attempted.retryAfterMilliseconds,
        this.transientRetry.baseMilliseconds,
      );
      if (delay === null) return attempted;

      this.options.rateLimits.recordRetry();
      this.options.logger.debug('Retrying a transient GitHub failure.', {
        resource: spec.resource,
        kind: attempted.outcome.error.kind,
        attempt: attempt + 1,
        delay,
      });
      await this.options.sleeper.sleep(delay);
    }
  }

  /**
   * One schedule for both waits — the settle loop and the transient loop differ in *when*
   * they wait, not in how long.
   *
   * `Retry-After` wins over the computed backoff wherever the response supplied one: polling
   * sooner than asked is how a client earns a secondary rate limit. Otherwise it is exponential
   * with full jitter, capped.
   *
   * `null` means stop waiting — the requested wait exceeds the policy ceiling. Shortening it
   * would ignore the server, and blocking a CLI for minutes is worse than reporting the failure
   * the caller can act on.
   */
  private backoffDelay(
    attempt: number,
    retryAfterMilliseconds: number | null,
    baseMilliseconds: number,
  ): number | null {
    if (retryAfterMilliseconds !== null) {
      return retryAfterMilliseconds > this.transientRetry.maximumDelayMilliseconds
        ? null
        : retryAfterMilliseconds;
    }
    const maximum = Math.min(
      baseMilliseconds * 2 ** attempt,
      this.transientRetry.maximumDelayMilliseconds,
    );
    return Math.floor(this.random() * maximum);
  }

  private async once<T>(spec: RequestSpec, parse: (value: unknown) => T): Promise<Attempt<T>> {
    if (spec.bucket === 'search') await this.searchPacer.wait();
    const decision = this.options.rateLimits.decide(spec.bucket);
    if (decision.kind === 'stop') {
      return {
        retryAfterMilliseconds: null,
        outcome: {
          ok: false,
          error: providerError(
            'rate-limited',
            'github_budget_stopped',
            `Request budget stopped ${decision.bucket} requests at ${String(decision.percentConsumed)}% consumed.`,
            { subject: spec.subject ?? null },
          ),
        },
      };
    }
    if (decision.kind === 'warn')
      this.options.logger.warn('GitHub request budget is nearing its limit.', {
        bucket: spec.bucket,
        percentConsumed: decision.percentConsumed,
      });

    const headers = new Headers({
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${this.options.token}`,
      'user-agent': this.options.userAgent,
      'x-github-api-version': '2022-11-28',
    });
    if (spec.etag !== undefined && spec.etag !== null) headers.set('if-none-match', spec.etag);

    let response: Response;
    try {
      response = await this.options.fetch(spec.url, { method: 'GET', headers });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        retryAfterMilliseconds: null,
        outcome: {
          ok: false,
          error: providerError(
            'network',
            'github_network_error',
            `GitHub request failed: ${message}`,
            {
              subject: spec.subject ?? null,
            },
          ),
        },
      };
    }

    this.options.rateLimits.recordResponse(spec.bucket, response.status, response.headers);
    const retryAfterMilliseconds = parseRetryAfterMilliseconds(
      response.headers,
      this.options.clock.now(),
    );
    const etag = response.headers.get('etag');
    if (
      (response.ok || response.status === 304 || response.status === 202) &&
      response.status !== 202
    ) {
      const priorObservation = this.observations.get(spec.resource);
      this.observations.set(spec.resource, {
        key: spec.resource,
        etag: etag ?? spec.etag ?? priorObservation?.etag ?? null,
        fetchedAt: this.options.clock.now().toISOString(),
        subject: spec.subject ?? null,
      });
    }
    if (response.status === 304 && spec.acceptNotModified === true) {
      return {
        retryAfterMilliseconds,
        outcome: {
          ok: true,
          value: {
            status: 304,
            notModified: true,
            etag,
            data: null,
            linkLastPage: parseLastPage(response.headers.get('link')),
          },
        },
      };
    }
    if (response.status === 202) {
      return {
        retryAfterMilliseconds,
        outcome: {
          ok: true,
          value: {
            status: 202,
            notModified: false,
            etag,
            data: null,
            linkLastPage: parseLastPage(response.headers.get('link')),
          },
        },
      };
    }

    const text = await response.text();
    if (!response.ok)
      return {
        retryAfterMilliseconds,
        outcome: {
          ok: false,
          error: classifyHttpError(response.status, text, response.headers, spec.subject ?? null),
        },
      };

    let raw: unknown;
    try {
      raw = text.length === 0 ? null : JSON.parse(text);
    } catch {
      return {
        retryAfterMilliseconds,
        outcome: {
          ok: false,
          error: providerError(
            'response-shape',
            'github_invalid_json',
            'GitHub returned invalid JSON.',
            {
              subject: spec.subject ?? null,
              status: response.status,
              retryable: false,
            },
          ),
        },
      };
    }
    try {
      return {
        retryAfterMilliseconds,
        outcome: {
          ok: true,
          value: {
            status: response.status,
            notModified: false,
            etag,
            data: parse(raw),
            linkLastPage: parseLastPage(response.headers.get('link')),
          },
        },
      };
    } catch {
      return {
        retryAfterMilliseconds,
        outcome: {
          ok: false,
          error: providerError(
            'response-shape',
            'github_response_shape',
            'GitHub returned a response with an unsupported shape.',
            {
              subject: spec.subject ?? null,
              status: response.status,
              retryable: false,
            },
          ),
        },
      };
    }
  }
}
