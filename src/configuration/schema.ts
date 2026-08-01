import { z } from 'zod';

/**
 * The versioned `github.config.json` schema.
 *
 * **There is deliberately no field a token value could occupy**, and `.strict()` at
 * every level is what turns that omission into a refusal rather than a silent
 * ignore. A schema incapable of holding a credential is a stronger guarantee than a
 * rule against logging one: it also rules out the token reaching the cache, the
 * exported documents, an error message, or a crash dump. Only the *name* of an
 * environment variable is configurable.
 *
 * Nested objects use `.prefault({})`, not `.default({})`. A default supplies the
 * *parsed* value, so it would have to restate every field — two declarations of the
 * same value, and two places to keep in step. A prefault is applied before parsing,
 * which lets the field-level `.default()` calls below stay the single source.
 */
export const configurationSchema = z
  .object({
    configVersion: z.literal('1.0.0'),

    auth: z
      .object({
        tokenEnvironmentVariable: z
          .string()
          .regex(/^[A-Z_][A-Z0-9_]*$/)
          .default('GITHUB_TOKEN'),
        /**
         * Opt-in and off by default. Reuse inherits whatever scopes the user's `gh`
         * session holds, usually broader than this plugin needs, so it is never a
         * silent fallback and is always reported.
         */
        allowGhCliTokenReuse: z.boolean().default(false),
      })
      .strict()
      .prefault({}),

    repositories: z
      .object({
        // Excluded means not *collected*, not merely hidden: collecting costs API
        // budget whether or not the result is displayed.
        includeForks: z.boolean().default(false),
        includeArchived: z.boolean().default(true),
        includeTemplates: z.boolean().default(true),
        includeDisabled: z.boolean().default(true),
        includePrivate: z.boolean().default(true),
        includePublic: z.boolean().default(true),
        /** Simple `*` globs over `owner/name`. An empty include list means no slug filter. */
        includeSlugs: z.array(z.string().min(1)).default([]),
        excludeSlugs: z.array(z.string().min(1)).default([]),
      })
      .strict()
      .prefault({}),

    collection: z
      .object({ profile: z.enum(['basic', 'standard', 'detailed']).default('standard') })
      .strict()
      .prefault({}),

    directories: z
      .object({
        cache: z.string().min(1).default('.cache'),
        output: z.string().min(1).default('output'),
      })
      .strict()
      .prefault({}),

    output: z
      .object({
        formats: z
          .array(z.enum(['json', 'yaml']))
          .min(1)
          .default(['json', 'yaml']),
        /** Unfiltered provider responses, for diagnosing drift. Large; off by default. */
        retainRawResponses: z.boolean().default(false),
      })
      .strict()
      .prefault({}),

    portfolio: z
      .object({
        /** Local authored metadata, matched only by immutable provider repository ID. */
        overrides: z.string().min(1).nullable().default(null),
      })
      .strict()
      .prefault({}),

    budget: z
      .object({
        concurrency: z.number().int().min(1).max(16).default(4),
        warnAtPercentConsumed: z.number().int().min(1).max(99).default(50),
        stopAtPercentConsumed: z.number().int().min(1).max(99).default(90),
        /** A separate rate-limit bucket from the primary one. */
        searchRequestsPerMinute: z.number().int().min(1).max(30).default(20),
        /** `/stats/*` answers 202 while GitHub computes; these bound the wait. */
        statisticsRetryAttempts: z.number().int().min(0).max(10).default(3),
        statisticsRetryBaseMilliseconds: z.number().int().min(100).max(60_000).default(1_000),
      })
      .strict()
      .prefault({}),

    documentation: z
      .object({
        /** For example `https://{owner}.github.io/{name}/`. Null infers nothing. */
        urlTemplate: z.string().min(1).nullable().default(null),
      })
      .strict()
      .prefault({}),
  })
  .strict()
  // Warn must come before stop. Reversed, the warning fires after the run has
  // already halted, which is a setting that reads as active and is not.
  .refine((value) => value.budget.warnAtPercentConsumed < value.budget.stopAtPercentConsumed, {
    message: 'budget.warnAtPercentConsumed must be below budget.stopAtPercentConsumed',
    path: ['budget', 'warnAtPercentConsumed'],
  });

export type Configuration = z.infer<typeof configurationSchema>;
