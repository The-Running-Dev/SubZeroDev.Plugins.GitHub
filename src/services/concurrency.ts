export type Settled<T> =
  | { readonly status: 'fulfilled'; readonly value: T }
  | { readonly status: 'rejected'; readonly reason: unknown }
  | { readonly status: 'skipped'; readonly reason: 'budget-stop' | 'cancelled' };

export interface ConcurrentMapResult<T> {
  readonly results: readonly Settled<T>[];
  readonly stopped: boolean;
}

/**
 * Runs work with a bounded number of workers while retaining input order.  The
 * order is intentional: provider responses may arrive in any order, but cache and
 * serialized output must not depend on scheduling.
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  options: {
    readonly limit: number;
    readonly shouldContinue?: () => boolean;
    readonly signal?: AbortSignal;
  },
): Promise<ConcurrentMapResult<R>> {
  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new RangeError('Concurrent map limit must be a positive integer.');
  }

  const results: Settled<R>[] = [];
  let stopped = false;
  // One iterator shared by every worker, so each `for` loop pulls the next unclaimed
  // entry. `next()` is synchronous, so two workers can never take the same index, and
  // the index travels with the item rather than being tracked alongside it.
  const queue = items.entries();

  const run = async (): Promise<void> => {
    for (const [index, item] of queue) {
      if (options.signal?.aborted) {
        results[index] = { status: 'skipped', reason: 'cancelled' };
        stopped = true;
        continue;
      }
      if (options.shouldContinue?.() === false) {
        results[index] = { status: 'skipped', reason: 'budget-stop' };
        stopped = true;
        continue;
      }

      try {
        results[index] = { status: 'fulfilled', value: await worker(item, index) };
      } catch (reason: unknown) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(options.limit, items.length) }, () => run()));
  return { results, stopped };
}
