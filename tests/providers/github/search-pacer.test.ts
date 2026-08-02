import { describe, expect, it } from 'vitest';

import { SearchRequestPacer } from '../../../src/providers/github/search-pacer.js';
import { fakeClock, fakeSleeper } from '../../support/fake-ports.js';

describe('Search API pacing', () => {
  it('admits no more than the configured count in a rolling minute', async () => {
    const clock = fakeClock();
    const sleeper = fakeSleeper(clock);
    const pacer = new SearchRequestPacer(20, clock, sleeper);
    const admittedAt: number[] = [];

    await Promise.all(
      Array.from({ length: 30 }, async () => {
        await pacer.wait();
        admittedAt.push(clock.now().getTime());
      }),
    );

    expect(sleeper.slept).toEqual([60_000]);
    for (const admitted of admittedAt) {
      expect(
        admittedAt.filter((candidate) => candidate <= admitted && candidate > admitted - 60_000)
          .length,
      ).toBeLessThanOrEqual(20);
    }
  });

  it('rejects a nonsensical limit at construction', () => {
    expect(() => new SearchRequestPacer(0, fakeClock(), fakeSleeper())).toThrow(RangeError);
  });
});
