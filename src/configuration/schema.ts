import { z } from 'zod';

export const configurationSchema = z
  .object({
    configVersion: z.literal('1.0.0'),
    auth: z
      .object({
        tokenEnvironmentVariable: z
          .string()
          .regex(/^[A-Z_][A-Z0-9_]*$/)
          .default('GITHUB_TOKEN'),
        allowGhCliTokenReuse: z.boolean().default(false),
      })
      .strict()
      .default({ tokenEnvironmentVariable: 'GITHUB_TOKEN', allowGhCliTokenReuse: false }),
    repositories: z
      .object({ includeForks: z.boolean().default(false) })
      .strict()
      .default({ includeForks: false }),
    collection: z
      .object({ profile: z.enum(['basic', 'standard', 'detailed']).default('standard') })
      .strict()
      .default({ profile: 'standard' }),
    directories: z
      .object({
        cache: z.string().min(1).default('.cache'),
        output: z.string().min(1).default('output'),
      })
      .strict()
      .default({ cache: '.cache', output: 'output' }),
    output: z
      .object({
        formats: z
          .array(z.enum(['json', 'yaml']))
          .min(1)
          .default(['json', 'yaml']),
        retainRawResponses: z.boolean().default(false),
      })
      .strict()
      .default({ formats: ['json', 'yaml'], retainRawResponses: false }),
    budget: z
      .object({
        concurrency: z.number().int().min(1).max(16).default(4),
        warnAtPercentConsumed: z.number().int().min(1).max(99).default(50),
        stopAtPercentConsumed: z.number().int().min(1).max(99).default(90),
        searchRequestsPerMinute: z.number().int().min(1).max(30).default(20),
      })
      .strict()
      .default({
        concurrency: 4,
        warnAtPercentConsumed: 50,
        stopAtPercentConsumed: 90,
        searchRequestsPerMinute: 20,
      }),
  })
  .strict();

export type Configuration = z.infer<typeof configurationSchema>;
