import { describe, expect, it } from 'vitest';

import { distributeLanguagePercentages } from '../../src/models/language.js';

describe('language percentage allocation', () => {
  it('allocates largest remainders deterministically and totals exactly 100', () => {
    const languages = distributeLanguagePercentages([
      { name: 'Zig', bytes: 1 },
      { name: 'Ada', bytes: 1 },
      { name: 'TypeScript', bytes: 1 },
    ]);

    expect(languages).toEqual([
      { name: 'Ada', bytes: 1, percentage: 33.34 },
      { name: 'TypeScript', bytes: 1, percentage: 33.33 },
      { name: 'Zig', bytes: 1, percentage: 33.33 },
    ]);
    expect(languages.reduce((total, language) => total + language.percentage, 0)).toBe(100);
  });

  it('keeps zero-byte distributions deterministic', () => {
    expect(
      distributeLanguagePercentages([
        { name: 'Zig', bytes: 0 },
        { name: 'Ada', bytes: 0 },
      ]),
    ).toEqual([
      { name: 'Ada', bytes: 0, percentage: 0 },
      { name: 'Zig', bytes: 0, percentage: 0 },
    ]);
  });
});
