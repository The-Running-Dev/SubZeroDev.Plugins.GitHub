import { describe, expect, it } from 'vitest';

import { mapConcurrent } from '../../src/services/concurrency.js';

describe('mapConcurrent', () => {
  it('limits in-flight work and keeps results in input order', async () => {
    let inFlight = 0;
    let maximum = 0;
    const result = await mapConcurrent(
      [0, 1, 2, 3],
      async (item) => {
        inFlight += 1;
        maximum = Math.max(maximum, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return 3 - item;
      },
      { limit: 2 },
    );

    expect(maximum).toBe(2);
    expect(result).toEqual({
      stopped: false,
      results: [
        { status: 'fulfilled', value: 3 },
        { status: 'fulfilled', value: 2 },
        { status: 'fulfilled', value: 1 },
        { status: 'fulfilled', value: 0 },
      ],
    });
  });

  it('keeps results index-aligned when completion order is reversed', async () => {
    const items = [0, 1, 2, 3, 4, 5, 6, 7];
    const result = await mapConcurrent(
      items,
      async (item, index) => {
        // Later items finish first, so nothing about the output may depend on scheduling.
        await new Promise((resolve) => setTimeout(resolve, (items.length - item) * 2));
        return `${String(index)}:${String(item)}`;
      },
      { limit: 4 },
    );

    expect(
      result.results.map((settled) => settled.status === 'fulfilled' && settled.value),
    ).toEqual(items.map((item, index) => `${String(index)}:${String(item)}`));
  });

  it('reports one rejection without losing the results around it', async () => {
    const failure = new Error('worker failed');
    const result = await mapConcurrent(
      [1, 2, 3],
      (item) => (item === 2 ? Promise.reject(failure) : Promise.resolve(item * 10)),
      { limit: 3 },
    );

    expect(result).toEqual({
      stopped: false,
      results: [
        { status: 'fulfilled', value: 10 },
        { status: 'rejected', reason: failure },
        { status: 'fulfilled', value: 30 },
      ],
    });
  });

  it('records cancellation separately from a budget stop', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await mapConcurrent([1, 2], (item) => Promise.resolve(item), {
      limit: 2,
      signal: controller.signal,
    });

    expect(result.stopped).toBe(true);
    expect(result.results).toEqual([
      { status: 'skipped', reason: 'cancelled' },
      { status: 'skipped', reason: 'cancelled' },
    ]);
  });

  it('stops dispatching mid-run once the guard turns, keeping what already ran', async () => {
    let completed = 0;
    const result = await mapConcurrent(
      [1, 2, 3, 4],
      (item) => {
        completed += 1;
        return Promise.resolve(item);
      },
      { limit: 1, shouldContinue: () => completed < 2 },
    );

    expect(completed).toBe(2);
    expect(result.results.map((settled) => settled.status)).toEqual([
      'fulfilled',
      'fulfilled',
      'skipped',
      'skipped',
    ]);
    expect(result.stopped).toBe(true);
  });

  it('does nothing, and reports nothing, for no work', async () => {
    await expect(mapConcurrent([], () => Promise.resolve(1), { limit: 4 })).resolves.toEqual({
      results: [],
      stopped: false,
    });
  });

  it('refuses a limit that is not a positive integer', async () => {
    for (const limit of [0, -1, 1.5, Number.NaN]) {
      await expect(
        mapConcurrent([1], (item) => Promise.resolve(item), { limit }),
      ).rejects.toBeInstanceOf(RangeError);
    }
  });

  it('records skipped work when a budget guard stops dispatch', async () => {
    const result = await mapConcurrent([1, 2, 3], (item) => Promise.resolve(item), {
      limit: 1,
      shouldContinue: () => false,
    });

    expect(result).toEqual({
      stopped: true,
      results: [
        { status: 'skipped', reason: 'budget-stop' },
        { status: 'skipped', reason: 'budget-stop' },
        { status: 'skipped', reason: 'budget-stop' },
      ],
    });
  });
});
