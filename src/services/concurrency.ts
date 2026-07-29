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
  const indexedItems = Array.from(items.entries());
  let next = 0;
  let stopped = false;

  const run = async (): Promise<void> => {
    while (next < indexedItems.length) {
      const index = next;
      next += 1;
      const entry = indexedItems[index];
      if (entry === undefined) return;
      const [originalIndex, item] = entry;

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
        results[index] = { status: 'fulfilled', value: await worker(item, originalIndex) };
      } catch (reason: unknown) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(options.limit, items.length) }, () => run()));
  return { results, stopped };
}
