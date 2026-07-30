/**
 * `Retry-After` per RFC 9110 §10.2.3, which permits either delta-seconds or an
 * HTTP-date. GitHub sends delta-seconds today, but a proxy in front of it is free to
 * send the date form, and reading only digits would silently discard the one number
 * the server explicitly asked us to honour.
 *
 * The date form is why the requester takes a `Clock`: converting an absolute instant
 * into a delay needs the current time, and taking it from `Date.now()` directly
 * would make the backoff untestable without spending the wait.
 */
export function parseRetryAfterMilliseconds(headers: Headers, now: Date): number | null {
  const value = headers.get('retry-after');
  if (value === null) return null;
  const trimmed = value.trim();

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isSafeInteger(seconds) ? seconds * 1_000 : null;
  }

  // Matched before parsing, deliberately. `Date.parse` is far more permissive than the
  // grammar: it reads `-5` as a date in 2001 and `5.5` as one in 2001 too, so handing it
  // anything non-numeric would turn a malformed header into "retry immediately" — the
  // one answer a rate-limited server did not give. Anything else falls through to our
  // own backoff, which is the safe default.
  if (!IMF_FIXDATE.test(trimmed)) return null;
  const until = Date.parse(trimmed);
  if (Number.isNaN(until)) return null;
  // A date already past means "retry now", not "wait a negative amount".
  return Math.max(0, until - now.getTime());
}

/** RFC 9110 §5.6.7 IMF-fixdate — the form the specification requires senders to use. */
const IMF_FIXDATE = /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/;
