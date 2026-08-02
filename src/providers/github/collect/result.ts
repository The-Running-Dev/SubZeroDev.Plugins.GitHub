import type { Diagnostic } from '../../../models/diagnostics.js';
import type { ProviderError } from '../../outcome.js';

export interface CollectorResult<T> {
  readonly value: T | null;
  readonly diagnostics: readonly Diagnostic[];
}

export function collected<T>(value: T): CollectorResult<T> {
  return { value, diagnostics: [] };
}

export function unavailable<T>(
  code: string,
  message: string,
  resource: string,
  retryable = false,
): CollectorResult<T> {
  return {
    value: null,
    diagnostics: [{ code, message, resource, detail: null, retryable }],
  };
}

export function unavailableFromError<T>(
  error: ProviderError,
  resource: string,
): CollectorResult<T> {
  return unavailable(error.code, error.message, resource, error.retryable);
}
