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

  it('breaks byte ties by code unit, not by locale collation', () => {
    // Real GitHub language names. Under a locale-aware collation `wisp` sorts
    // before `XML`; by code unit it sorts after. Equal bytes force the tiebreak,
    // so this asserts which comparator is in use.
    const languages = distributeLanguagePercentages([
      { name: 'wisp', bytes: 10 },
      { name: 'XML', bytes: 10 },
    ]);

    expect(languages.map((language) => language.name)).toEqual(['XML', 'wisp']);
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

  it('totals 10,000 basis points across generated distributions', () => {
    for (let count = 1; count <= 50; count += 1) {
      const languages = distributeLanguagePercentages(
        Array.from({ length: count }, (_, index) => ({
          name: `Language-${String(index).padStart(2, '0')}`,
          bytes: ((index + 1) * 37 + count * 13) % 997,
        })),
      );

      expect(
        languages.reduce((total, language) => total + Math.round(language.percentage * 100), 0),
      ).toBe(10_000);
    }
  });
});
