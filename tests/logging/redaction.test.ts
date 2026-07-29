import { afterEach, describe, expect, it } from 'vitest';

import { sanitizeError, scrubSecrets } from '../../src/logging/redaction.js';
import { clearRegisteredSecrets, registerSecret } from '../../src/logging/secret-registry.js';

afterEach(clearRegisteredSecrets);

describe('secret redaction', () => {
  it('redacts raw and URL-encoded registered values', () => {
    registerSecret('ghp_CANARY_DO_NOT_LEAK/+');

    expect(scrubSecrets('token=ghp_CANARY_DO_NOT_LEAK/+')).not.toContain('CANARY');
    expect(scrubSecrets('token=ghp_CANARY_DO_NOT_LEAK%2F%2B')).not.toContain('CANARY');
  });

  it('redacts error messages before serialization', () => {
    registerSecret('ghp_CANARY_DO_NOT_LEAK');

    expect(sanitizeError(new Error('authorization: ghp_CANARY_DO_NOT_LEAK')).message).toBe(
      'authorization: [redacted]',
    );
  });
});
