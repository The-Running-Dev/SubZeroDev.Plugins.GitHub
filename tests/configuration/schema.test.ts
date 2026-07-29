import { describe, expect, it } from 'vitest';

import { configurationSchema } from '../../src/configuration/schema.js';

describe('configuration schema', () => {
  it('applies defaults without representing a token value', () => {
    expect(configurationSchema.parse({ configVersion: '1.0.0' })).toMatchObject({
      auth: { tokenEnvironmentVariable: 'GITHUB_TOKEN', allowGhCliTokenReuse: false },
      collection: { profile: 'standard' },
    });
  });

  it('refuses unknown token-shaped keys', () => {
    const result = configurationSchema.safeParse({
      configVersion: '1.0.0',
      auth: { token: 'ghp_CANARY_DO_NOT_LEAK' },
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['auth']);
  });
});
