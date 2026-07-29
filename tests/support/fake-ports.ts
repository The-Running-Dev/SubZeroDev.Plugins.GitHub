import type { Clock, FileStat, FileSystemPort, Sleeper } from '../../src/services/ports.js';

/** Advances only when told to, so a backoff test never waits on real time. */
export interface FakeClock extends Clock {
  advance(milliseconds: number): void;
}

export function fakeClock(start = new Date('2026-07-29T12:00:00Z')): FakeClock {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advance: (milliseconds) => {
      current += milliseconds;
    },
  };
}

export interface FakeSleeper extends Sleeper {
  /** Every requested duration, in order — the assertion target for backoff tests. */
  readonly slept: readonly number[];
}

/**
 * Resolves immediately and records the duration. A retry test asserts the schedule
 * without spending it; a test that takes as long as the backoff it exercises is a
 * test nobody runs.
 */
export function fakeSleeper(clock?: FakeClock): FakeSleeper {
  const slept: number[] = [];
  return {
    slept,
    sleep: (milliseconds) => {
      slept.push(milliseconds);
      clock?.advance(milliseconds);
      return Promise.resolve();
    },
  };
}

export interface MemoryFileSystem extends FileSystemPort {
  readonly writes: readonly string[];
  readonly renames: readonly { readonly from: string; readonly to: string }[];
  set(path: string, contents: string): void;
  read(path: string): string | undefined;
  has(path: string): boolean;
}

const normalize = (path: string): string => path.replaceAll('\\', '/');

/**
 * In-memory `FileSystemPort`. Records writes and renames so a test can assert that a
 * dry run wrote nothing, which is a claim only an observed absence can support.
 */
export function memoryFileSystem(initial: Readonly<Record<string, string>> = {}): MemoryFileSystem {
  const files = new Map<string, string>(
    Object.entries(initial).map(([path, contents]) => [normalize(path), contents]),
  );
  const directories = new Set<string>();
  const writes: string[] = [];
  const renames: { from: string; to: string }[] = [];

  const missing = (path: string): Error =>
    Object.assign(new Error(`ENOENT: no such file or directory, open '${path}'`), {
      code: 'ENOENT',
    });

  return {
    writes,
    renames,
    set: (path, contents) => files.set(normalize(path), contents),
    read: (path) => files.get(normalize(path)),
    has: (path) => files.has(normalize(path)),

    readFile: (path) => {
      const contents = files.get(normalize(path));
      if (contents === undefined) return Promise.reject(missing(path));
      return Promise.resolve(new TextEncoder().encode(contents));
    },
    writeFile: (path, contents) => {
      const key = normalize(path);
      files.set(key, new TextDecoder().decode(contents));
      writes.push(key);
      return Promise.resolve();
    },
    rename: (from, to) => {
      const key = normalize(from);
      const contents = files.get(key);
      if (contents === undefined) return Promise.reject(missing(from));
      files.delete(key);
      files.set(normalize(to), contents);
      renames.push({ from: key, to: normalize(to) });
      return Promise.resolve();
    },
    mkdir: (path) => {
      directories.add(normalize(path));
      return Promise.resolve();
    },
    readdir: (path) => {
      const prefix = `${normalize(path)}/`;
      const entries = new Set<string>();
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) entries.add(key.slice(prefix.length).split('/')[0] ?? '');
      }
      return Promise.resolve([...entries].filter(Boolean).sort());
    },
    stat: (path) => {
      const key = normalize(path);
      const contents = files.get(key);
      if (contents !== undefined) {
        return Promise.resolve<FileStat>({ isDirectory: false, size: contents.length });
      }
      if (directories.has(key)) return Promise.resolve<FileStat>({ isDirectory: true, size: 0 });
      return Promise.resolve(null);
    },
    realpath: (path) => Promise.resolve(normalize(path)),
    remove: (path) => {
      const key = normalize(path);
      files.delete(key);
      directories.delete(key);
      for (const existing of [...files.keys()]) {
        if (existing.startsWith(`${key}/`)) files.delete(existing);
      }
      return Promise.resolve();
    },
  };
}
