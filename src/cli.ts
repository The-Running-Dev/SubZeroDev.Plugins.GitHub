#!/usr/bin/env node

import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { GLOBAL_OPTIONS } from './commands/global-options.js';
import { isCommandName, type OperationalCommandModule } from './commands/types.js';
import { writeManifest } from './commands/manifest.js';
import { commandLoaders } from './commands/registry.js';
import { createCommandContext } from './services/command-context.js';
import { buildEnvelope, writeEnvelope } from './output/envelope.js';
import { isLogLevel } from './logging/logger.js';
import { ConfigurationError } from './configuration/index.js';

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
        readonly config?: string;
        readonly 'log-level'?: string;
        readonly quiet?: boolean;
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

/** Asynchronous operational dispatcher; the synchronous helper above remains for CLI contract tests. */
export async function runCliAsync(argv: readonly string[]): Promise<number> {
  const parsed = parseArguments(argv);
  if (!parsed.ok) return runCli(argv);
  const { values, positionals } = parsed;
  if (values.help || values.version || positionals.length === 0) return runCli(argv);

  const command = positionals[0];
  if (!command || !isCommandName(command) || command === 'manifest') return runCli(argv);
  const loader = commandLoaders[command];
  if (loader === undefined) return runCli(argv);

  const logLevelValue = values['log-level'];
  if (logLevelValue !== undefined && !isLogLevel(logLevelValue)) {
    process.stderr.write(`Invalid --log-level: ${logLevelValue}\n`);
    return 2;
  }
  const environmentLogLevel = process.env['SUBZERODEV_LOG_LEVEL'];
  const logLevel =
    logLevelValue ??
    (environmentLogLevel !== undefined && isLogLevel(environmentLogLevel)
      ? environmentLogLevel
      : 'info');
  const startedAt = new Date().toISOString();
  try {
    const context = await createCommandContext({
      configPath: values.config ?? 'github.config.json',
      logLevel,
      quiet: values.quiet ?? false,
    });
    const module = await loader();
    if (!isOperationalCommandModule(module)) return runCli(argv);
    const result = await module.run(context);
    const envelope = buildEnvelope({
      command,
      pluginVersion: readVersion(),
      startedAt,
      finishedAt: new Date().toISOString(),
      result,
    });
    writeEnvelope(envelope, process.stdout);
    return envelope.exitCode;
  } catch (error: unknown) {
    const details = error instanceof ConfigurationError ? error : null;
    const envelope = buildEnvelope({
      command,
      pluginVersion: readVersion(),
      startedAt,
      finishedAt: new Date().toISOString(),
      result: {
        outcome: { kind: 'failed', exitCode: details?.code === 'token_missing' ? 5 : 2 },
        summary: 'Command configuration could not be loaded.',
        errors: [
          {
            code: details?.code ?? 'command_initialization_failed',
            message: details?.message ?? 'Command initialization failed.',
            retryable: false,
          },
        ],
      },
    });
    writeEnvelope(envelope, process.stdout);
    return envelope.exitCode;
  }
}

function isOperationalCommandModule(value: unknown): value is OperationalCommandModule {
  return (
    typeof value === 'object' && value !== null && 'run' in value && typeof value.run === 'function'
  );
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
  void runCliAsync(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
