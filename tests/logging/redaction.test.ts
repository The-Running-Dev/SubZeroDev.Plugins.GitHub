import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLogger } from '../../src/logging/logger.js';
import { REDACTED, sanitizeError, scrubSecrets } from '../../src/logging/redaction.js';
import {
  clearRegisteredSecrets,
  registerSecret,
  registeredSecrets,
} from '../../src/logging/secret-registry.js';

const CANARY = 'ghp_CANARY_DO_NOT_LEAK';

afterEach(clearRegisteredSecrets);

/** Collects everything a logger wrote, so a canary search can cover all of it. */
function capture(): { stream: PassThrough; text: () => string } {
  const stream = new PassThrough();
  const chunks: string[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk.toString('utf8')));
  return { stream, text: () => chunks.join('') };
}

describe('secret redaction', () => {
  it('redacts raw and URL-encoded registered values', () => {
    registerSecret('ghp_CANARY_DO_NOT_LEAK/+');

    expect(scrubSecrets('token=ghp_CANARY_DO_NOT_LEAK/+')).not.toContain('CANARY');
    expect(scrubSecrets('token=ghp_CANARY_DO_NOT_LEAK%2F%2B')).not.toContain('CANARY');
  });

  it('redacts error messages before serialization', () => {
    registerSecret(CANARY);

    expect(sanitizeError(new Error(`authorization: ${CANARY}`)).message).toBe(
      `authorization: ${REDACTED}`,
    );
  });

  it('refuses to register a value too short to scrub safely', () => {
    // A two-character "secret" would replace ordinary substrings across every line,
    // which destroys the diagnostics the log exists for.
    expect(registerSecret('ab')).toBe(false);
    expect(registeredSecrets()).toEqual([]);
    expect(scrubSecrets('a stable message')).toBe('a stable message');
  });

  it('follows a cause chain three levels deep', () => {
    registerSecret(CANARY);
    const root = new Error(`deepest: ${CANARY}`);
    const middle = new Error('middle', { cause: root });
    const top = new Error('top', { cause: middle });

    const serialized = JSON.stringify(sanitizeError(top));

    expect(serialized).not.toContain('CANARY');
    expect(sanitizeError(top).cause?.cause?.message).toBe(`deepest: ${REDACTED}`);
  });

  it('terminates on a cyclic cause graph', () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    (a as { cause?: unknown }).cause = b;

    // The guard is the point: without a seen-set this recurses until the stack dies.
    expect(() => sanitizeError(a)).not.toThrow();
  });

  it('drops request and response objects wholesale rather than field by field', () => {
    registerSecret(CANARY);
    const requestError = Object.assign(new Error('HTTP 401'), {
      status: 401,
      request: { headers: { authorization: `token ${CANARY}`, 'x-custom-auth': CANARY } },
      response: { headers: { 'set-cookie': CANARY } },
    });

    const serialized = JSON.stringify(sanitizeError(requestError));

    expect(serialized).not.toContain('CANARY');
    // Not copied at all — enumerating known header names would leave the unknown ones.
    expect(serialized).not.toContain('x-custom-auth');
    expect(sanitizeError(requestError).status).toBe(401);
  });

  it('scrubs the stack, not only the message', () => {
    registerSecret(CANARY);
    const error = new Error('boom');
    error.stack = `Error: boom\n    at fetch (https://api.github.com/?access_token=${CANARY})`;

    expect(sanitizeError(error).stack).not.toContain('CANARY');
  });
});

describe('logger destination', () => {
  it('writes to the injected stream and never to stdout', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { stream, text } = capture();
    const logger = createLogger({ level: 'trace', destination: stream });

    logger.trace('trace line');
    logger.error('error line');

    // stdout carries exactly one JSON document in JSON mode — the envelope. One log
    // record there corrupts it and breaks every adapter at once.
    expect(stdout).not.toHaveBeenCalled();
    expect(text()).toContain('trace line');
    expect(text()).toContain('error line');

    stdout.mockRestore();
  });

  it('keeps a registered secret out of every level of log output', () => {
    registerSecret(CANARY);
    const { stream, text } = capture();
    const logger = createLogger({ level: 'trace', destination: stream });

    logger.info(`inline ${CANARY}`);
    logger.debug('structured', { token: CANARY });
    logger.error('with error', { err: new Error(`nested ${CANARY}`) });
    logger.child({ authorization: CANARY }).warn('from a child');

    expect(text()).not.toContain('CANARY');
  });

  it('scrubs an Error logged under any key, at any depth', () => {
    // Regression: deepScrub used to pass Error instances through for "the serializer
    // to handle" — but serializers fire only on the err/error keys, so an Error under
    // another key, or nested a level down, reached the output with its enumerable own
    // properties intact. Octokit-style errors carry the authorization header exactly
    // there, and pino's path-based redact stops matching one level down.
    registerSecret(CANARY);
    const { stream, text } = capture();
    const logger = createLogger({ level: 'trace', destination: stream });

    const requestError = Object.assign(new Error(`msg ${CANARY}`), {
      request: { headers: { authorization: `token ${CANARY}` } },
      extra: `plain ${CANARY}`,
    });
    logger.info('non-serializer key', { boom: requestError });
    logger.info('nested two deep', { outer: { inner: requestError } });

    expect(text()).not.toContain('CANARY');
    // And the err-key path still produces a readable shape, not '[object Object]'.
    logger.error('serializer key', { err: new Error(`nested ${CANARY}`) });
    expect(text()).toContain('nested [redacted]');
    expect(text()).not.toContain('[object Object]');
  });

  it('raises the effective level to error when quiet', () => {
    const { stream, text } = capture();
    const logger = createLogger({ level: 'trace', quiet: true, destination: stream });

    logger.info('suppressed');
    logger.error('kept');

    expect(text()).not.toContain('suppressed');
    expect(text()).toContain('kept');
  });
});
