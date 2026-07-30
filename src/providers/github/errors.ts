import { scrubSecrets } from '../../logging/redaction.js';
import type { ProviderError, ProviderErrorKind } from '../outcome.js';

export function providerError(
  kind: ProviderErrorKind,
  code: string,
  message: string,
  options: {
    readonly subject?: string | null;
    readonly status?: number | null;
    readonly retryable?: boolean;
  } = {},
): ProviderError {
  return {
    kind,
    code,
    message: scrubSecrets(message),
    subject: options.subject ?? null,
    retryable:
      options.retryable ??
      (kind === 'server-error' ||
        kind === 'network' ||
        kind === 'rate-limited' ||
        kind === 'secondary-rate-limit'),
    status: options.status ?? null,
  };
}

export function classifyHttpError(
  status: number,
  body: string,
  headers: Headers,
  subject: string | null,
): ProviderError {
  if (status === 401)
    return providerError(
      'unauthenticated',
      'github_unauthenticated',
      'GitHub rejected the credential.',
      { status, subject },
    );
  if (status === 404)
    return providerError('not-found', 'github_not_found', 'The GitHub resource was not found.', {
      status,
      subject,
      retryable: false,
    });
  if (status === 429)
    return providerError(
      'rate-limited',
      'github_rate_limited',
      'GitHub rate limited the request.',
      { status, subject },
    );
  if (status === 403) {
    if (headers.get('x-ratelimit-remaining') === '0')
      return providerError(
        'rate-limited',
        'github_rate_limited',
        'GitHub primary rate limit is exhausted.',
        { status, subject },
      );
    if (headers.has('retry-after') || /secondary rate limit/i.test(body))
      return providerError(
        'secondary-rate-limit',
        'github_secondary_rate_limit',
        'GitHub secondary rate limit is active.',
        { status, subject },
      );
    return providerError('forbidden', 'github_forbidden', 'GitHub denied access to the resource.', {
      status,
      subject,
      retryable: false,
    });
  }
  if (status >= 500)
    return providerError(
      'server-error',
      'github_server_error',
      `GitHub returned HTTP ${String(status)}.`,
      { status, subject },
    );
  return providerError(
    'response-shape',
    'github_unexpected_response',
    `GitHub returned unexpected HTTP ${String(status)}.`,
    { status, subject, retryable: false },
  );
}
