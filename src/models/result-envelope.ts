import { z } from 'zod';

import { timestampSchema } from './primitives.js';

const semverSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
  );

const diagnosticSchema = z.looseObject({
  code: z.string().regex(/^[a-z0-9]+(_[a-z0-9]+)*$/),
  message: z.string().min(1),
});

const errorDiagnosticSchema = diagnosticSchema.extend({ retryable: z.boolean() });

const artifactReferenceSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    path: z
      .string()
      .min(1)
      .regex(/^(?![/\\])(?![A-Za-z]:)(?!.*(^|[/\\])\.\.([/\\]|$)).+$/),
    bytes: z.number().int().min(0),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mediaType: z.string().min(1).optional(),
  })
  .strict();

const strictTimestampSchema = timestampSchema.refine(isValidUtcTimestamp, {
  message: 'Expected a valid RFC 3339 UTC timestamp',
});

/** Runtime validation boundary for the versioned plugin-contract result envelope. */
export const resultEnvelopeSchema = z
  .object({
    schemaVersion: z.literal('1.0.0'),
    plugin: z
      .object({
        id: z.literal('subzerodev.github'),
        version: semverSchema,
      })
      .strict(),
    command: z.enum(['manifest', 'validate', 'sync', 'list', 'stats', 'export']),
    status: z.enum(['succeeded', 'partial', 'failed', 'cancelled', 'timedOut']),
    summary: z.string().min(1),
    startedAt: strictTimestampSchema,
    finishedAt: strictTimestampSchema,
    data: z.record(z.string(), z.unknown()),
    warnings: z.array(diagnosticSchema),
    errors: z.array(errorDiagnosticSchema),
    artifacts: z.array(artifactReferenceSchema),
    metrics: z.record(z.string(), z.number()),
    exitCode: z.union([
      z.literal(0),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
      z.literal(124),
      z.literal(130),
    ]),
  })
  .loose()
  .superRefine((envelope, context) => {
    if (Date.parse(envelope.finishedAt) < Date.parse(envelope.startedAt)) {
      context.addIssue({
        code: 'custom',
        message: 'Result envelope finishedAt must not precede startedAt.',
        path: ['finishedAt'],
      });
    }

    const expectedExitCode =
      envelope.status === 'succeeded'
        ? 0
        : envelope.status === 'partial'
          ? 4
          : envelope.status === 'timedOut'
            ? 124
            : envelope.status === 'cancelled'
              ? 130
              : undefined;
    if (expectedExitCode !== undefined && envelope.exitCode !== expectedExitCode) {
      context.addIssue({
        code: 'custom',
        message: `Status ${envelope.status} requires its prescribed exit code.`,
        path: ['exitCode'],
      });
    }

    if (envelope.status === 'failed') {
      if (
        [0, 1, 4, 124, 130].includes(envelope.exitCode) ||
        envelope.exitCode < 2 ||
        envelope.exitCode > 113
      ) {
        context.addIssue({
          code: 'custom',
          message: 'A failed result requires a failure exit code.',
          path: ['exitCode'],
        });
      }
    }

    if (
      (envelope.status === 'partial' || envelope.status === 'failed') &&
      envelope.errors.length === 0
    ) {
      context.addIssue({
        code: 'too_small',
        minimum: 1,
        inclusive: true,
        origin: 'array',
        message: 'Partial and failed results require at least one error.',
        path: ['errors'],
      });
    }
  });

function isValidUtcTimestamp(value: string): boolean {
  const [date = '', time = ''] = value.split('T');
  const [year = Number.NaN, month = Number.NaN, day = Number.NaN] = date.split('-').map(Number);
  const [hour = '', minute = '', secondsWithZone = ''] = time.split(':');
  const seconds = Number(secondsWithZone.slice(0, 2));
  const monthDays = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return (
    Number(hour) <= 23 &&
    Number(minute) <= 59 &&
    seconds <= 60 &&
    day <= (monthDays[month - 1] ?? 0) &&
    day >= 1
  );
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
