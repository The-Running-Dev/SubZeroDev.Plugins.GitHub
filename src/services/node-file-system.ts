import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';

import type { FileSystemPort } from './ports.js';

/** Node implementation kept behind the filesystem port for command/service tests. */
export const nodeFileSystem: FileSystemPort = {
  readFile,
  writeFile: (path, contents) => writeFile(path, contents),
  rename,
  mkdir: (path, options) => mkdir(path, options).then(() => undefined),
  readdir,
  stat: async (path) => {
    try {
      const value = await stat(path);
      return { isDirectory: value.isDirectory(), size: value.size };
    } catch (error: unknown) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  },
  realpath,
  remove: (path, options) => rm(path, options).then(() => undefined),
};

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
