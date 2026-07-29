export class ConfigurationError extends Error {
  public constructor(
    message: string,
    public readonly path: readonly PropertyKey[] = [],
  ) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
