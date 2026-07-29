import { registeredSecrets } from './secret-registry.js';

export const REDACTED = '[redacted]';

/**
 * Value-based, deliberately. Name-based redaction alone misses the realistic leak —
 * a token interpolated into a message string, where no field is named `token` at
 * all. Both the raw value and its percent-encoded form are replaced, because a
 * token that travelled through a URL arrives encoded.
 */
export function scrubSecrets(value: string): string {
  return registeredSecrets().reduce((scrubbed, secret) => {
    const encoded = encodeURIComponent(secret);
    const withRaw = scrubbed.replaceAll(secret, REDACTED);
    return encoded === secret ? withRaw : withRaw.replaceAll(encoded, REDACTED);
  }, value);
}

/**
 * Applies `scrubSecrets` to every string reachable in a value, so a secret is caught
 * wherever it sits — a bare message, a nested field, an array element — rather than
 * only at the paths a redaction list happens to name.
 *
 * `Error` instances are converted through `sanitizeError` **here**, not left for a
 * serializer. An earlier version passed them through untouched on the assumption
 * that pino's `err` serializer would handle them — but serializers fire only on
 * their configured keys, so an Error logged under any other key, or nested inside
 * another object, reached the output with its enumerable own properties intact.
 * Octokit-style errors carry `request.headers.authorization` exactly there, and
 * pino's path-based `redact` stops matching one level down. Converting at the walk
 * is what makes the guarantee hold at every key and every depth.
 */
export function deepScrub(value: unknown, depth = 0): unknown {
  if (depth > 8) return value;
  if (value instanceof Error) return sanitizeError(value);
  if (typeof value === 'string') return scrubSecrets(value);
  if (Array.isArray(value)) return value.map((entry) => deepScrub(entry, depth + 1));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, deepScrub(entry, depth + 1)]),
    );
  }
  return value;
}

export interface SanitizedError {
  readonly name: string;
  readonly message: string;
  readonly stack: string | null;
  readonly status: number | null;
  readonly cause: SanitizedError | null;
}

/** Deeper than this is a malformed graph, not diagnostics worth keeping. */
const MAX_CAUSE_DEPTH = 8;

function readStatus(error: Error): number | null {
  if ('status' in error && typeof error.status === 'number') return error.status;
  // Some HTTP clients put it here instead.
  if ('statusCode' in error && typeof error.statusCode === 'number') return error.statusCode;
  return null;
}

/**
 * Walks `.cause` to a bounded depth, tracking seen errors so a cycle terminates
 * rather than recursing forever.
 *
 * **Returns a fixed shape and copies no arbitrary own properties.** That is the
 * point: an HTTP error carries `request` and `response`, and a request object
 * carries the `authorization` header — and a client is free to add another header
 * that also holds the credential. Enumerating the fields we know to strip would
 * leave the ones we do not, so nothing is copied unless it is named here.
 */
export function sanitizeError(
  error: unknown,
  seen: ReadonlySet<unknown> = new Set(),
): SanitizedError {
  if (!(error instanceof Error)) {
    return {
      name: 'Error',
      message: scrubSecrets(String(error)),
      stack: null,
      status: null,
      cause: null,
    };
  }

  const visited = new Set(seen).add(error);
  const { cause } = error;
  const sanitizedCause =
    cause !== undefined && cause !== null && !visited.has(cause) && visited.size <= MAX_CAUSE_DEPTH
      ? sanitizeError(cause, visited)
      : null;

  return {
    name: error.name,
    message: scrubSecrets(error.message),
    stack: error.stack === undefined ? null : scrubSecrets(error.stack),
    status: readStatus(error),
    cause: sanitizedCause,
  };
}
