import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { parse } from 'yaml';

interface PackageMetadata {
  readonly name?: string;
  readonly version?: string;
  readonly private?: boolean;
  readonly license?: string;
  readonly repository?: { readonly url?: string };
  readonly homepage?: string;
  readonly files?: readonly string[];
  readonly bin?: Readonly<Record<string, string>>;
}

const metadata = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as PackageMetadata;
const manifest = parse(readFileSync(resolve('plugin.yaml'), 'utf8')) as { version?: string };
assert(metadata.name === '@subzerodev/plugins-github', 'Package name is not release-ready.');
assert(metadata.private === undefined, 'package.json must not declare private.');
assert(metadata.license === 'MIT', 'package.json must declare the MIT license.');
assert(
  metadata.repository?.url?.includes('SubZeroDev.Plugins.GitHub') === true,
  'Repository metadata is missing.',
);
assert(
  metadata.homepage === 'https://plugins-github.subzerodev.com',
  'Homepage metadata is missing.',
);
assert(metadata.version === manifest.version, 'package.json and plugin.yaml versions differ.');
for (const required of ['dist', 'schemas', 'plugin.yaml']) {
  assert(metadata.files?.includes(required) === true, `Package files omits ${required}.`);
}
for (const [name, target] of Object.entries(metadata.bin ?? {})) {
  const contents = readFileSync(resolve(target), 'utf8');
  assert(contents.startsWith('#!/usr/bin/env node'), `Binary ${name} lacks the Node shebang.`);
}

const npmEntrypoint = process.env['npm_execpath'];
assert(npmEntrypoint !== undefined, 'npm_execpath is unavailable. Run this check through npm.');
const packed = spawnSync(
  process.execPath,
  [npmEntrypoint, 'pack', '--dry-run', '--json', '--ignore-scripts'],
  { encoding: 'utf8' },
);
assert(packed.status === 0, packed.stderr || packed.error?.message || 'npm pack --dry-run failed.');
const report = JSON.parse(packed.stdout) as readonly [
  { readonly files: readonly { path: string }[] },
];
const paths = report[0].files.map(({ path }) => path.replaceAll('\\', '/'));
for (const prefix of ['dist/', 'schemas/']) {
  assert(
    paths.some((path) => path.startsWith(prefix)),
    `Tarball omits ${prefix}.`,
  );
}
assert(paths.includes('plugin.yaml'), 'Tarball omits plugin.yaml.');
for (const forbidden of ['tests/', 'docs/', '.github/']) {
  assert(!paths.some((path) => path.startsWith(forbidden)), `Tarball includes ${forbidden}.`);
}
assert(!paths.some((path) => path.includes('.env')), 'Tarball includes an environment file.');

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
