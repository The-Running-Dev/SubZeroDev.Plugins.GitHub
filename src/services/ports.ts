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
