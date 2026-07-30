#!/usr/bin/env node

import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { GLOBAL_OPTIONS } from './commands/global-options.js';
import { isCommandName } from './commands/types.js';
import { writeManifest } from './commands/manifest.js';

const help = `SubZeroDev GitHub Plugin

Usage:
  subzerodev-github <command> [options]

Commands:
  manifest  Print the canonical plugin manifest
  sync      Download or incrementally update repository data
  list      Display repositories
  stats     Display aggregate statistics
  export    Export normalized project data
  validate  Validate configuration and cached data

Options:
  -h, --help     Show help
  -v, --version  Show version
`;

type ParsedArguments =
  | {
      readonly ok: true;
      readonly values: {
        readonly help?: boolean;
        readonly version?: boolean;
      };
      readonly positionals: readonly string[];
    }
  | { readonly ok: false; readonly message: string };

function parseArguments(argv: readonly string[]): ParsedArguments {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: GLOBAL_OPTIONS,
    });

    return { ok: true, values, positionals };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export function readVersion(): string {
  // Resolved from the module rather than hard-coded so it cannot drift from the package.
  const contents: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );

  if (
    typeof contents !== 'object' ||
    contents === null ||
    !('version' in contents) ||
    typeof contents.version !== 'string'
  ) {
    throw new Error('package.json does not declare a string version.');
  }

  return contents.version;
}

export function runCli(argv: readonly string[]): number {
  const parsed = parseArguments(argv);
  if (!parsed.ok) {
    process.stderr.write(`Invalid arguments: ${parsed.message}\n\n${help}`);
    return 2;
  }

  const { values, positionals } = parsed;

  if (values.version) {
    process.stdout.write(`${readVersion()}\n`);
    return 0;
  }

  if (values.help || positionals.length === 0) {
    process.stdout.write(help);
    return 0;
  }

  const command = positionals[0];
  if (!command || !isCommandName(command)) {
    const invalidCommand = command ?? '';
    process.stderr.write(`Unknown command: ${invalidCommand}\n\n${help}`);
    return 2;
  }

  if (command === 'manifest') {
    writeManifest(process.stdout);
    return 0;
  }

  process.stderr.write(`Command "${command}" is not implemented yet.\n`);
  return 3;
}

export function isEntryPoint(moduleUrl: string, entryPoint: string | undefined): boolean {
  if (!entryPoint) {
    return false;
  }

  // npm installs the binary as a symlink in node_modules/.bin, and Node resolves
  // import.meta.url to the real file, so the invoked path must be resolved too.
  try {
    return moduleUrl === pathToFileURL(realpathSync(entryPoint)).href;
  } catch {
    return false;
  }
}

if (isEntryPoint(import.meta.url, process.argv[1])) {
  process.exitCode = runCli(process.argv.slice(2));
}
