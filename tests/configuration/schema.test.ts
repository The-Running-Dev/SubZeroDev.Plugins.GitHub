import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { configurationSchema } from '../../src/configuration/schema.js';

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/configuration/${name}.json`, import.meta.url), 'utf8'),
  );

describe('configuration schema', () => {
  it('applies every default from the minimal fixture', () => {
    expect(configurationSchema.parse(fixture('valid-minimal'))).toEqual({
      configVersion: '1.0.0',
      auth: { tokenEnvironmentVariable: 'GITHUB_TOKEN', allowGhCliTokenReuse: false },
      repositories: {
        includeForks: false,
        includeArchived: true,
        includeTemplates: true,
        includeDisabled: true,
        includePrivate: true,
        includePublic: true,
        includeSlugs: [],
        excludeSlugs: [],
      },
      collection: { profile: 'standard' },
      directories: { cache: '.cache', output: 'output' },
      output: { formats: ['json', 'yaml'], retainRawResponses: false },
      budget: {
        concurrency: 4,
        warnAtPercentConsumed: 50,
        stopAtPercentConsumed: 90,
        searchRequestsPerMinute: 20,
        statisticsRetryAttempts: 3,
        statisticsRetryBaseMilliseconds: 1_000,
      },
      documentation: { urlTemplate: null },
    });
  });

  it('accepts a fully populated configuration unchanged', () => {
    const parsed = configurationSchema.parse(fixture('valid-full'));

    expect(parsed.collection.profile).toBe('detailed');
    expect(parsed.repositories.includeSlugs).toEqual(['the-running-dev/*']);
    expect(parsed.auth.tokenEnvironmentVariable).toBe('SUBZERODEV_GITHUB_TOKEN');
  });

  it('refuses a configuration carrying a token value, naming the key', () => {
    const result = configurationSchema.safeParse(fixture('contains-token'));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['auth']);
      // The refusal must name the offending key, or the message is unactionable.
      expect(JSON.stringify(result.error.issues)).toContain('token');
    }
  });

  it('refuses an unknown key rather than ignoring it', () => {
    const result = configurationSchema.safeParse(fixture('unknown-key'));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['collection']);
  });

  it('refuses an unsupported config version', () => {
    const result = configurationSchema.safeParse(fixture('wrong-version'));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['configVersion']);
  });

  it('keeps examples/github.config.json valid', () => {
    // The example is documentation, and documentation rots. This is the tripwire.
    const example: unknown = JSON.parse(
      readFileSync(new URL('../../examples/github.config.json', import.meta.url), 'utf8'),
    );

    expect(configurationSchema.safeParse(example).success).toBe(true);
    // It should also be the defaults, so a reader can delete any line safely.
    expect(configurationSchema.parse(example)).toEqual(
      configurationSchema.parse({ configVersion: '1.0.0' }),
    );
  });

  it('refuses a warn threshold at or above the stop threshold', () => {
    // A warning that fires after the run has halted is a setting that reads as
    // active and is not.
    const result = configurationSchema.safeParse(fixture('budget-inverted'));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['budget', 'warnAtPercentConsumed']);
    }
  });
});

describe('configuration schema shape', () => {
  /**
   * Walks the schema and collects every leaf key name. This is the mechanical guard:
   * prose saying "never add a token field" is not enforcement, and a future field
   * named `token`, `pat`, or `credential` would otherwise pass review and only fail
   * once a real secret had been committed to somebody's config file.
   *
   * **This reads Zod's internal `_zod.def`, which is not public API.** Accepted for
   * now, with `zod` pinned to `~4.4.3` so a minor bump cannot silently change the
   * shape underneath it; a patch release changing internals is unlikely, and the
   * failure mode is a loud test error rather than a disarmed guard.
   *
   * The better fix is to walk `z.toJSONSchema()` output instead — public API, and the
   * same call Milestone 6 introduces for `projects.schema.json` (§8). Deferred to
   * there rather than done speculatively here, because this schema ends in a
   * `.refine()` and whether that survives JSON Schema conversion needs verifying, not
   * assuming.
   */
  function leafKeys(schema: z.ZodType, seen = new Set<unknown>()): string[] {
    if (seen.has(schema)) return [];
    seen.add(schema);

    const def = (
      schema as unknown as { readonly _zod?: { readonly def?: Record<string, unknown> } }
    )._zod?.def;
    if (def === undefined) return [];

    const shape = def['shape'];
    if (shape !== undefined && typeof shape === 'object' && shape !== null) {
      return Object.entries(shape as Record<string, z.ZodType>).flatMap(([key, value]) => [
        key,
        ...leafKeys(value, seen),
      ]);
    }

    // Unwrap defaults, prefaults, nullables, optionals, arrays, refinements.
    return ['innerType', 'element', 'in', 'out'].flatMap((property) => {
      const inner = def[property];
      return inner === undefined ? [] : leafKeys(inner as z.ZodType, seen);
    });
  }

  /**
   * Whole words, split out of camelCase — not a substring match. `/pat/` matches
   * inside `stopAtPercentConsumed`, and a false positive here is worse than none: the
   * obvious repair is to weaken the pattern, which quietly disarms the guard.
   */
  const FORBIDDEN_WORDS = new Set([
    'token',
    'secret',
    'password',
    'credential',
    'credentials',
    'pat',
    'authorization',
    'auth',
    'bearer',
    'key',
    'apikey',
  ]);

  function words(key: string): string[] {
    return key
      .replaceAll(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/);
  }

  it('contains no field a credential could occupy', () => {
    const keys = leafKeys(configurationSchema);

    // Proves the walker reached the leaves. Without this an empty result would make
    // the assertion below vacuously true.
    expect(keys).toContain('tokenEnvironmentVariable');
    expect(keys).toContain('statisticsRetryBaseMilliseconds');
    expect(keys.length).toBeGreaterThan(20);

    // These two name a variable and a flag, never a value.
    const allowed = new Set(['tokenEnvironmentVariable', 'allowGhCliTokenReuse', 'auth']);

    const suspicious = keys.filter(
      (key) => !allowed.has(key) && words(key).some((word) => FORBIDDEN_WORDS.has(word)),
    );

    expect(suspicious).toEqual([]);
  });

  it('would catch a credential-shaped field if one were added', () => {
    // Guards the guard: proves the check fails on the thing it exists to catch.
    expect(words('githubToken')).toContain('token');
    expect(words('apiSecret')).toContain('secret');
    expect(words('stopAtPercentConsumed')).not.toContain('pat');
  });
});
