/**
 * Stable, machine-readable identifiers. Policy and tests key on these, so they must
 * not change when the message wording does. They follow the envelope's
 * `errors[].code` convention: lowercase, underscore-separated.
 */
export type ConfigurationErrorCode =
  'config_unreadable' | 'config_invalid' | 'config_version_unsupported' | 'token_missing';

export class ConfigurationError extends Error {
  public constructor(
    message: string,
    public readonly path: readonly PropertyKey[] = [],
    public readonly code: ConfigurationErrorCode = 'config_invalid',
  ) {
    super(message);
    this.name = 'ConfigurationError';
  }

  /** Dotted path to the offending key, so a message can name it. */
  public get pointer(): string {
    return this.path.map(String).join('.');
  }
}
