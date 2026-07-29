import {
  destination as pinoDestination,
  pino,
  type DestinationStream,
  type Logger as PinoLogger,
} from 'pino';

import { deepScrub, REDACTED, sanitizeError, scrubSecrets } from './redaction.js';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

export const LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info', 'debug', 'trace'];

export function isLogLevel(value: string): value is LogLevel {
  return LOG_LEVELS.some((level) => level === value);
}

export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  error(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  debug(message: string, fields?: LogFields): void;
  trace(message: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

/**
 * Name-based backstop only. The mechanism is `scrubSecrets`, because pino's
 * `redact` matches paths and cannot follow a `.cause` chain or find a token
 * interpolated into a message. Both run: this catches a whole header object handed
 * to a log call, `scrubSecrets` catches the value wherever else it surfaced.
 */
const REDACT_PATHS = [
  'token',
  '*.token',
  'accessToken',
  '*.accessToken',
  'authorization',
  '*.authorization',
  'headers.authorization',
  '*.headers.authorization',
  'request.headers',
  '*.request.headers',
  'response.headers',
  '*.response.headers',
];

export interface CreateLoggerOptions {
  readonly level: LogLevel;
  /** Raises the effective level to `error`. Never affects stdout. */
  readonly quiet?: boolean;
  /** Tests inject a stream. Production omits it and gets fd 2. */
  readonly destination?: DestinationStream;
}

function wrap(logger: PinoLogger): Logger {
  /**
   * Both halves go through `deepScrub`, including the message. pino's `redact` matches
   * paths and so never inspects `msg` — a token interpolated straight into a log line
   * would otherwise pass every name-based check and land in the output.
   */
  const emit =
    (level: LogLevel) =>
    (message: string, fields?: LogFields): void => {
      const scrubbedMessage = scrubSecrets(message);
      if (fields === undefined) {
        logger[level](scrubbedMessage);
        return;
      }
      logger[level](deepScrub(fields) as LogFields, scrubbedMessage);
    };

  return {
    error: emit('error'),
    warn: emit('warn'),
    info: emit('info'),
    debug: emit('debug'),
    trace: emit('trace'),
    // Scrubbed here too: bound fields are attached to every subsequent record, so a
    // secret bound once would leak on every line rather than just one.
    child: (fields) => wrap(logger.child(deepScrub(fields) as LogFields)),
  };
}

/**
 * **`fd: 2` is the single most load-bearing literal in this codebase.** pino
 * defaults to stdout, and in JSON mode stdout carries exactly one document — the
 * result envelope — so a log record there corrupts it and breaks every adapter at
 * once. It presents as a JSON parse error rather than a logging bug, which is why
 * conformance forces `trace` before checking stdout.
 *
 * `sync: true` matters too: an asynchronous destination can drop buffered records
 * when the process exits non-zero, losing exactly the diagnostics a failure needs.
 */
export function createLogger({ level, quiet = false, destination }: CreateLoggerOptions): Logger {
  return wrap(
    pino(
      {
        level: quiet ? 'error' : level,
        // null, not undefined: omits pid and hostname, which are noise here and
        // would differ between runs in a snapshot.
        base: null,
        redact: { paths: REDACT_PATHS, censor: REDACTED },
        // Backstop for a raw Error reaching pino by a path that skipped deepScrub.
        // Guarded, because the normal path has already converted Errors to plain
        // SanitizedError objects — running sanitizeError on one of those would
        // collapse it to { name: 'Error', message: '[object Object]' }.
        serializers: {
          err: (value: unknown) => (value instanceof Error ? sanitizeError(value) : value),
          error: (value: unknown) => (value instanceof Error ? sanitizeError(value) : value),
        },
        formatters: { level: (label) => ({ level: label }) },
      },
      destination ?? pinoDestination({ fd: 2, sync: true }),
    ),
  );
}
