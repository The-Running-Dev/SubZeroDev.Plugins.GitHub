import { isAbsolute, relative, resolve } from 'node:path';

export function confinedPath(root: string, relativePath: string): string {
  if (isAbsolute(relativePath)) throw new Error('Artifact paths must be relative.');
  const resolvedRoot = resolve(root);
  const candidate = resolve(resolvedRoot, relativePath);
  const fromRoot = relative(resolvedRoot, candidate);
  if (fromRoot === '..' || fromRoot.startsWith(`..${pathSeparator()}`) || isAbsolute(fromRoot)) {
    throw new Error(`Artifact path escapes its root: ${relativePath}`);
  }
  return candidate;
}

function pathSeparator(): '\\' | '/' {
  return process.platform === 'win32' ? '\\' : '/';
}
