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
