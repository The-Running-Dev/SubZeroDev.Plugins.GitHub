export type Outcome<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export type ProviderErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'rate-limited'
  | 'secondary-rate-limit'
  | 'not-found'
  | 'server-error'
  | 'network'
  | 'response-shape'
  | 'not-settled';

export interface ProviderError {
  readonly kind: ProviderErrorKind;
  readonly message: string;
  readonly retryable: boolean;
}
