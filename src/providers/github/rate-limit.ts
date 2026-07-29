import type { RequestUsage } from '../provider.js';

export type RateLimitBucket = 'core' | 'search';

export type BudgetDecision =
  | { readonly kind: 'proceed' }
  | { readonly kind: 'warn'; readonly percentConsumed: number }
  | { readonly kind: 'stop'; readonly percentConsumed: number; readonly bucket: RateLimitBucket };

export interface RequestBudget {
  readonly warnAtPercentConsumed: number;
  readonly stopAtPercentConsumed: number;
  readonly coreLimit?: number;
  readonly searchLimit?: number;
}

interface BucketState {
  limit: number;
  remaining: number;
  requests: number;
  warned: boolean;
}

const initialState = (limit: number): BucketState => ({
  limit,
  remaining: limit,
  requests: 0,
  warned: false,
});

/** Holds only rate-limit accounting; HTTP transport remains in `request.ts`. */
export class RateLimitTracker {
  private readonly core: BucketState;
  private readonly search: BucketState;
  private notModifiedResponses = 0;
  private retries = 0;

  public constructor(private readonly budget: RequestBudget) {
    this.core = initialState(budget.coreLimit ?? 5_000);
    this.search = initialState(budget.searchLimit ?? 30);
  }

  public decide(bucket: RateLimitBucket): BudgetDecision {
    const state = this.state(bucket);
    const consumed = this.percentConsumed(state);
    if (consumed >= this.budget.stopAtPercentConsumed)
      return { kind: 'stop', percentConsumed: consumed, bucket };
    if (!state.warned && consumed >= this.budget.warnAtPercentConsumed) {
      state.warned = true;
      return { kind: 'warn', percentConsumed: consumed };
    }
    return { kind: 'proceed' };
  }

  public recordResponse(bucket: RateLimitBucket, status: number, headers: Headers): void {
    const state = this.state(bucket);
    const limit = numberHeader(headers, 'x-ratelimit-limit');
    const remaining = numberHeader(headers, 'x-ratelimit-remaining');
    if (limit !== null) state.limit = limit;
    if (remaining !== null) state.remaining = remaining;
    if (status === 304) {
      this.notModifiedResponses += 1;
      return;
    }
    state.requests += 1;
    if (remaining === null) state.remaining = Math.max(0, state.remaining - 1);
  }

  public recordRetry(): void {
    this.retries += 1;
  }

  public usage(): RequestUsage {
    return {
      primaryRequests: this.core.requests,
      searchRequests: this.search.requests,
      notModifiedResponses: this.notModifiedResponses,
      retries: this.retries,
    };
  }

  private state(bucket: RateLimitBucket): BucketState {
    return bucket === 'core' ? this.core : this.search;
  }

  private percentConsumed(state: BucketState): number {
    if (state.limit === 0) return 100;
    return Math.floor(((state.limit - state.remaining) / state.limit) * 100);
  }
}

function numberHeader(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (value === null || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}
