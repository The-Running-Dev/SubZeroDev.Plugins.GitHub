import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import type { FileSystemPort } from '../services/ports.js';

const WINDOWS_ABSOLUTE = /^(?:[A-Za-z]:[\\/]|[\\/]{2})/;

export function confinedPath(root: string, relativePath: string): string {
  const portable = relativePath.replaceAll('\\', '/');
  if (
    isAbsolute(relativePath) ||
    WINDOWS_ABSOLUTE.test(relativePath) ||
    portable.split('/').includes('..')
  ) {
    throw new Error(`Artifact path escapes its root: ${relativePath}`);
  }
  const resolvedRoot = resolve(root);
  const candidate = resolve(resolvedRoot, portable);
  if (!isWithin(resolvedRoot, candidate)) {
    throw new Error(`Artifact path escapes its root: ${relativePath}`);
  }
  return candidate;
}

/** Refuses lexical traversal and existing symlink ancestors that leave the root. */
export async function confinedRealPath(
  fileSystem: FileSystemPort,
  root: string,
  relativePath: string,
): Promise<string> {
  const candidate = confinedPath(root, relativePath);
  const resolvedRoot = resolve(root);
  await fileSystem.mkdir(resolvedRoot, { recursive: true });
  const realRoot = await fileSystem.realpath(resolvedRoot);
  let ancestor = dirname(candidate);
  while ((await fileSystem.stat(ancestor)) === null && ancestor !== resolvedRoot) {
    ancestor = dirname(ancestor);
  }
  const realAncestor = await fileSystem.realpath(ancestor);
  if (!isWithin(realRoot, realAncestor)) {
    throw new Error(`Artifact path resolves outside its root: ${relativePath}`);
  }
  return candidate;
}

function isWithin(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === '' ||
    (fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot))
  );
}
