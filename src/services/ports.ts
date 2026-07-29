export interface Clock {
  now(): Date;
}
export interface Sleeper {
  sleep(milliseconds: number, signal?: AbortSignal): Promise<void>;
}
export interface FileStat {
  readonly isDirectory: boolean;
  readonly size: number;
}
export interface FileSystemPort {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, contents: Uint8Array): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  mkdir(path: string, options?: { readonly recursive?: boolean }): Promise<void>;
  readdir(path: string): Promise<readonly string[]>;
  stat(path: string): Promise<FileStat | null>;
  realpath(path: string): Promise<string>;
  remove(path: string, options?: { readonly recursive?: boolean }): Promise<void>;
}

export interface ExternalCredential {
  readonly token: string;
  /** Where it came from. Reported so reuse is never silent; never the value. */
  readonly configPath: string;
}

/**
 * A port, so token resolution depends on the *shape* of an external credential
 * source and not on any provider's storage format. The GitHub CLI implementation
 * lives under `src/providers/github/`, where provider-specific acquisition belongs.
 */
export interface ExternalCredentialSource {
  /** Resolves `null` when no credential is available, rather than throwing. */
  read(): Promise<ExternalCredential | null>;
}
