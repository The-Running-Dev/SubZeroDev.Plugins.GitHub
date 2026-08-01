#!/usr/bin/env node

import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { ConfigurationError } from './configuration/index.js';
import { buildHelp } from './commands/help.js';
import { GLOBAL_OPTIONS, splitAtCommand } from './commands/global-options.js';
import { writeManifest } from './commands/manifest.js';
import { commandLoaders } from './commands/registry.js';
import {
  type CommandInvocation,
  type CommandName,
  type OperationalCommandModule,
} from './commands/types.js';
import { isLogLevel } from './logging/logger.js';
import { COMMAND_OPTIONS } from './models/command-options.js';
import { buildEnvelope } from './output/envelope.js';
import { failedOutcome, failureClassForCode } from './commands/outcome.js';
import { writeResult } from './output/render.js';
import { createCommandContext } from './services/command-context.js';

type CliValues = Readonly<Record<string, string | boolean | readonly string[] | undefined>>;
type ParsedArguments =
  | { readonly ok: true; readonly command: CommandName | null; readonly values: CliValues }
  | { readonly ok: false; readonly command: CommandName | null; readonly message: string };

export interface CliRuntime {
  readonly createContext?: typeof createCommandContext;
  readonly stdout?: NodeJS.WritableStream;
  readonly stderr?: NodeJS.WritableStream;
  readonly now?: () => Date;
}

function parseArguments(argv: readonly string[]): ParsedArguments {
  const split = splitAtCommand(argv);
  try {
    const first = parseArgs({
      args: [...split.before],
      allowPositionals: true,
      strict: true,
      options: GLOBAL_OPTIONS,
    });
    if (first.positionals.length > 0) {
      return {
        ok: false,
        command: null,
        message: `Unknown command: ${first.positionals[0] ?? ''}`,
      };
    }
    if (split.command === null)
      return { ok: true, command: null, values: first.values as CliValues };

    const second = parseArgs({
      args: [...split.after],
      allowPositionals: false,
      strict: true,
      options: { ...GLOBAL_OPTIONS, ...COMMAND_OPTIONS[split.command] },
    });
    return {
      ok: true,
      command: split.command,
      values: { ...first.values, ...second.values },
    };
  } catch (error: unknown) {
    return {
      ok: false,
      command: split.command,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function resolveOutputFormat(values: CliValues): 'text' | 'json' | null {
  const explicit = values['output-format'];
  if (values['json'] === true && explicit === 'text') return null;
  if (explicit !== undefined && explicit !== 'text' && explicit !== 'json') return null;
  return values['json'] === true || explicit === 'json' ? 'json' : 'text';
}

export function readVersion(): string {
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

/** Synchronous contract helper for help, version, manifest, and argument validation. */
export function runCli(argv: readonly string[]): number {
  const parsed = parseArguments(argv);
  if (!parsed.ok) {
    process.stderr.write(
      `${parsed.message.startsWith('Unknown command:') ? '' : 'Invalid arguments: '}${parsed.message}\n\n${buildHelp(parsed.command ?? undefined)}`,
    );
    return 2;
  }
  if (parsed.values['version'] === true) {
    process.stdout.write(`${readVersion()}\n`);
    return 0;
  }
  if (parsed.values['help'] === true || parsed.command === null) {
    process.stdout.write(buildHelp(parsed.command ?? undefined));
    return 0;
  }
  if (resolveOutputFormat(parsed.values) === null) {
    process.stderr.write('--json cannot be combined with --output-format text.\n');
    return 2;
  }
  if (parsed.command === 'manifest') {
    writeManifest(process.stdout);
    return 0;
  }
  process.stderr.write(`Command "${parsed.command}" requires asynchronous dispatch.\n`);
  return 3;
}

export async function runCliAsync(
  argv: readonly string[],
  runtime: CliRuntime = {},
): Promise<number> {
  const stdout = runtime.stdout ?? process.stdout;
  const stderr = runtime.stderr ?? process.stderr;
  const now = runtime.now ?? (() => new Date());
  const parsed = parseArguments(argv);
  if (!parsed.ok) {
    stderr.write(
      `${parsed.message.startsWith('Unknown command:') ? '' : 'Invalid arguments: '}${parsed.message}\n\n${buildHelp(parsed.command ?? undefined)}`,
    );
    return 2;
  }
  if (parsed.values['version'] === true) {
    stdout.write(`${readVersion()}\n`);
    return 0;
  }
  if (parsed.values['help'] === true || parsed.command === null) {
    stdout.write(buildHelp(parsed.command ?? undefined));
    return 0;
  }
  const command = parsed.command;
  const outputFormat = resolveOutputFormat(parsed.values);
  if (outputFormat === null) {
    stderr.write('--json cannot be combined with --output-format text.\n');
    return 2;
  }
  if (command === 'manifest') {
    writeManifest(stdout);
    return 0;
  }
  const logLevelValue = parsed.values['log-level'];
  if (
    logLevelValue !== undefined &&
    (typeof logLevelValue !== 'string' || !isLogLevel(logLevelValue))
  ) {
    stderr.write(`Invalid --log-level: ${String(logLevelValue)}\n`);
    return 2;
  }
  const environmentLogLevel = process.env['SUBZERODEV_LOG_LEVEL'];
  const logLevel =
    logLevelValue ??
    (environmentLogLevel !== undefined && isLogLevel(environmentLogLevel)
      ? environmentLogLevel
      : 'info');
  const startedAt = now().toISOString();
  try {
    const context = await (runtime.createContext ?? createCommandContext)({
      configPath:
        typeof parsed.values['config'] === 'string'
          ? parsed.values['config']
          : (process.env['SUBZERODEV_PLUGIN_CONFIG'] ?? 'github.config.json'),
      logLevel,
      quiet: parsed.values['quiet'] === true,
    });
    const loader = commandLoaders[command];
    if (loader === undefined) throw new Error(`No command module is registered for ${command}.`);
    const module = await loader();
    if (!isOperationalCommandModule(module)) throw new Error(`Command ${command} cannot run.`);
    const invocation: CommandInvocation = {
      global: { outputFormat, dryRun: parsed.values['dry-run'] === true },
      values: parsed.values,
    };
    const result = await module.run(context, invocation);
    const envelope = buildEnvelope({
      command,
      pluginVersion: readVersion(),
      startedAt,
      finishedAt: now().toISOString(),
      result,
    });
    writeResult(envelope, outputFormat, stdout);
    return envelope.exitCode;
  } catch (error: unknown) {
    const details = error instanceof ConfigurationError ? error : null;
    const code = details?.code ?? 'command_execution_failed';
    const envelope = buildEnvelope({
      command,
      pluginVersion: readVersion(),
      startedAt,
      finishedAt: now().toISOString(),
      result: {
        outcome: failedOutcome(details === null ? 'operational' : failureClassForCode(code)),
        summary:
          details === null
            ? 'Command execution failed.'
            : 'Command configuration could not be loaded.',
        errors: [
          {
            code,
            message:
              details?.message ??
              (error instanceof Error ? error.message : 'Command execution failed.'),
            retryable: false,
          },
        ],
      },
    });
    writeResult(envelope, outputFormat, stdout);
    return envelope.exitCode;
  }
}

function isOperationalCommandModule(value: unknown): value is OperationalCommandModule {
  return (
    typeof value === 'object' && value !== null && 'run' in value && typeof value.run === 'function'
  );
}

export function isEntryPoint(moduleUrl: string, entryPoint: string | undefined): boolean {
  if (!entryPoint) return false;
  try {
    return moduleUrl === pathToFileURL(realpathSync(entryPoint)).href;
  } catch {
    return false;
  }
}

if (isEntryPoint(import.meta.url, process.argv[1])) {
  void runCliAsync(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `Unexpected command failure: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 3;
    });
}
