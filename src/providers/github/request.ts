import type { Logger } from '../../logging/logger.js';
import type { Clock, Sleeper } from '../../services/ports.js';
import type { Outcome, ProviderError } from '../outcome.js';

import { classifyHttpError, providerError } from './errors.js';
import { parseLastPage } from './link-header.js';
import type { RateLimitBucket, RateLimitTracker } from './rate-limit.js';
import type { ResourceKey } from './resource-keys.js';

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

export interface GitHubRequesterOptions {
  readonly fetch: typeof globalThis.fetch;
  readonly token: string;
  readonly userAgent: string;
  readonly logger: Logger;
  readonly sleeper: Sleeper;
  readonly clock: Clock;
  readonly rateLimits: RateLimitTracker;
  readonly random?: () => number;
}

export class GitHubRequester {
  private readonly random: () => number;

  public constructor(private readonly options: GitHubRequesterOptions) {
    this.random = options.random ?? Math.random;
  }

  public async get<T>(
    spec: RequestSpec,
    parse: (value: unknown) => T,
  ): Promise<Outcome<GitHubResponse<T>, ProviderError>> {
    const attempts = spec.settleRetry?.attempts ?? 0;
    for (let attempt = 0; attempt <= attempts; attempt += 1) {
      const response = await this.once(spec, parse);
      if (
        !response.ok ||
        response.value.status !== 202 ||
        spec.settleRetry === undefined ||
        attempt === attempts
      )
        return response;

      this.options.rateLimits.recordRetry();
      const maximum = spec.settleRetry.baseMilliseconds * 2 ** attempt;
      const delay = Math.floor(this.random() * maximum);
      this.options.logger.debug('GitHub statistics are still being computed; retrying.', {
        resource: spec.resource,
        attempt: attempt + 1,
        delay,
      });
      await this.options.sleeper.sleep(delay);
    }
    return {
      ok: false,
      error: providerError(
        'not-settled',
        'github_statistics_not_settled',
        'GitHub statistics did not settle in time.',
      ),
    };
  }

  public usage() {
    return this.options.rateLimits.usage();
  }

  private async once<T>(
    spec: RequestSpec,
    parse: (value: unknown) => T,
  ): Promise<Outcome<GitHubResponse<T>, ProviderError>> {
    const decision = this.options.rateLimits.decide(spec.bucket);
    if (decision.kind === 'stop') {
      return {
        ok: false,
        error: providerError(
          'rate-limited',
          'github_budget_stopped',
          `Request budget stopped ${decision.bucket} requests at ${String(decision.percentConsumed)}% consumed.`,
          { subject: spec.subject ?? null },
        ),
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
        ok: false,
        error: providerError(
          'network',
          'github_network_error',
          `GitHub request failed: ${message}`,
          {
            subject: spec.subject ?? null,
          },
        ),
      };
    }

    this.options.rateLimits.recordResponse(spec.bucket, response.status, response.headers);
    const etag = response.headers.get('etag');
    if (response.status === 304 && spec.acceptNotModified === true) {
      return {
        ok: true,
        value: {
          status: 304,
          notModified: true,
          etag,
          data: null,
          linkLastPage: parseLastPage(response.headers.get('link')),
        },
      };
    }
    if (response.status === 202) {
      return {
        ok: true,
        value: {
          status: 202,
          notModified: false,
          etag,
          data: null,
          linkLastPage: parseLastPage(response.headers.get('link')),
        },
      };
    }

    const text = await response.text();
    if (!response.ok)
      return {
        ok: false,
        error: classifyHttpError(response.status, text, response.headers, spec.subject ?? null),
      };

    let raw: unknown;
    try {
      raw = text.length === 0 ? null : JSON.parse(text);
    } catch {
      return {
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
      };
    }
    try {
      return {
        ok: true,
        value: {
          status: response.status,
          notModified: false,
          etag,
          data: parse(raw),
          linkLastPage: parseLastPage(response.headers.get('link')),
        },
      };
    } catch {
      return {
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
      };
    }
  }
}
