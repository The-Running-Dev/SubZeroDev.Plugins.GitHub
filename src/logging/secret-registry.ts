const secrets = new Set<string>();

/**
 * Below this, a "secret" is more likely to be a fragment than a credential, and
 * scrubbing it would replace ordinary substrings across every log line — which
 * destroys the diagnostics the log exists for and reads as if redaction is broken.
 * Real tokens are far longer; the shortest GitHub PAT prefix alone exceeds this.
 */
const MINIMUM_SECRET_LENGTH = 8;

/**
 * Registers a value for value-based scrubbing. Called once, where the token is
 * resolved, so nothing downstream has to thread the value through the call graph
 * just to keep it out of a log record.
 *
 * Returns whether the value was registered, so a caller can tell "redaction is
 * armed" from "that value was too short to arm it" rather than assuming.
 */
export function registerSecret(secret: string): boolean {
  if (secret.length < MINIMUM_SECRET_LENGTH) return false;
  secrets.add(secret);
  return true;
}

export function registeredSecrets(): readonly string[] {
  return [...secrets];
}

/** Test seam. The registry is process-local and never serialized. */
export function clearRegisteredSecrets(): void {
  secrets.clear();
}
