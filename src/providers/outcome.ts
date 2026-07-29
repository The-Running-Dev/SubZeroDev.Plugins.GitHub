/**
 * A result type, not exceptions, across the port boundary. Partial success is a
 * first-class outcome here — one repository failing must not invalidate the rest —
 * and an exception makes it far too easy to abort a whole discovery loop on one bad
 * item.
 */
export type Outcome<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export type ProviderErrorKind =
  /** 401 — exit 5. */
  | 'unauthenticated'
  /** 403 without rate-limit headers — exit 5. */
  | 'forbidden'
  /** 403 or 429 with rate-limit headers — exit 6. */
  | 'rate-limited'
  | 'secondary-rate-limit'
  /** 404 — usually a valid `null` upstream rather than a failure. */
  | 'not-found'
  | 'server-error'
  | 'network'
  /** Payload did not match its schema. **Not** retryable: drift needs a code change. */
  | 'response-shape'
  /** A `/stats/*` 202 exhausted its retry budget. */
  | 'not-settled';

export interface ProviderError {
  readonly kind: ProviderErrorKind;
  /**
   * Stable machine-readable identifier, e.g. `repository_statistics_unavailable`.
   * Becomes the envelope's `errors[].code`, which policy keys on, so it must not
   * change when the message wording does.
   */
  readonly code: string;
  /** Already scrubbed. Reaches logs, execution history, and often a screen. */
  readonly message: string;
  /** By convention `type:id` — for example `repository:12345`. */
  readonly subject: string | null;
  /**
   * The plugin knows most about the failure, so it advises the retry policy rather
   * than leaving the host to infer intent from an exit code.
   */
  readonly retryable: boolean;
  readonly status: number | null;
}
