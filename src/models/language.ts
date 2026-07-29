import { z } from 'zod';

import { compareCodeUnits, nonEmptyStringSchema, nonNegativeIntegerSchema } from './primitives.js';

const percentageSchema = z.number().min(0).max(100).multipleOf(0.01);

export const languageStatisticsSchema = z.object({
  name: nonEmptyStringSchema,
  bytes: nonNegativeIntegerSchema,
  percentage: percentageSchema,
});

export type LanguageStatistics = z.infer<typeof languageStatisticsSchema>;

export interface LanguageByteCount {
  readonly name: string;
  readonly bytes: number;
}

/**
 * Uses largest-remainder allocation on 10,000 basis points. The resulting
 * percentages always total exactly 100.00 and have a stable ordering.
 */
export function distributeLanguagePercentages(
  byteCounts: readonly LanguageByteCount[],
): readonly LanguageStatistics[] {
  const entries = byteCounts.map(({ name, bytes }) => ({
    name: nonEmptyStringSchema.parse(name),
    bytes: nonNegativeIntegerSchema.parse(bytes),
  }));

  if (new Set(entries.map(({ name }) => name)).size !== entries.length) {
    throw new RangeError('Language names must be unique');
  }

  const total = entries.reduce((sum, entry) => sum + BigInt(entry.bytes), 0n);
  if (total === 0n) {
    return entries.sort(compareLanguageEntries).map((entry) => ({ ...entry, percentage: 0 }));
  }

  const basis = 10_000n;
  const allocated = entries.map((entry) => {
    const numerator = BigInt(entry.bytes) * basis;
    return { ...entry, points: numerator / total, remainder: numerator % total };
  });
  const allocatedPoints = allocated.reduce((sum, entry) => sum + entry.points, 0n);
  const remainderCount = Number(basis - allocatedPoints);

  [...allocated]
    .sort((a, b) => {
      if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
      return compareLanguageEntries(a, b);
    })
    .slice(0, remainderCount)
    .forEach((entry) => {
      entry.points += 1n;
    });

  return allocated
    .sort(compareLanguageEntries)
    .map(({ name, bytes, points }) => ({ name, bytes, percentage: Number(points) / 100 }));
}

function compareLanguageEntries(
  a: Pick<LanguageByteCount, 'bytes' | 'name'>,
  b: Pick<LanguageByteCount, 'bytes' | 'name'>,
): number {
  if (a.bytes !== b.bytes) return b.bytes - a.bytes;
  // Code units, not `localeCompare` — see compareCodeUnits. GitHub has
  // lowercase-initial language names (`wisp`, `nesC`, `eC`, `sed`), and under a
  // locale-aware collation those invert against capitalised ones, so the emitted
  // order of `languages[]` would depend on the runner's locale.
  return compareCodeUnits(a.name, b.name);
}
