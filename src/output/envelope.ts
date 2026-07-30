import type { CommandName } from '../commands/types.js';

export type CommandOutcome =
  | { readonly kind: 'succeeded' }
  | { readonly kind: 'partial' }
  | { readonly kind: 'failed'; readonly exitCode: 2 | 3 | 5 | 6 }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'timedOut' };

export interface Diagnostic {
  readonly code: string;
  readonly message: string;
  readonly path?: readonly (string | number)[];
}

export interface ErrorDiagnostic extends Diagnostic {
  readonly retryable: boolean;
}

export interface ArtifactReference {
  readonly name: string;
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly mediaType?: string;
}

export interface CommandResult {
  readonly outcome: CommandOutcome;
  readonly summary: string;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly warnings?: readonly Diagnostic[];
  readonly errors?: readonly ErrorDiagnostic[];
  readonly artifacts?: readonly ArtifactReference[];
  readonly metrics?: Readonly<Record<string, number>>;
}

export interface ResultEnvelope {
  readonly schemaVersion: '1.0.0';
  readonly plugin: { readonly id: 'subzerodev.github'; readonly version: string };
  readonly command: CommandName;
  readonly status: 'succeeded' | 'partial' | 'failed' | 'cancelled' | 'timedOut';
  readonly summary: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly warnings: readonly Diagnostic[];
  readonly errors: readonly ErrorDiagnostic[];
  readonly artifacts: readonly ArtifactReference[];
  readonly metrics: Readonly<Record<string, number>>;
  readonly exitCode: 0 | 2 | 3 | 4 | 5 | 6 | 124 | 130;
}

const DATA_LIMIT_BYTES = 256 * 1024;

export function buildEnvelope(input: {
  readonly command: CommandName;
  readonly pluginVersion: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly result: CommandResult;
}): ResultEnvelope {
  if (Date.parse(input.finishedAt) < Date.parse(input.startedAt)) {
    throw new RangeError('Result envelope finishedAt must not precede startedAt.');
  }

  const warnings = [...(input.result.warnings ?? [])];
  const data = input.result.data ?? {};
  const serializedBytes = new TextEncoder().encode(JSON.stringify(data)).byteLength;
  const boundedData =
    serializedBytes <= DATA_LIMIT_BYTES
      ? data
      : {
          dataOmitted: true,
          reason: 'Result data exceeds the 256 KiB result-envelope limit.',
          serializedBytes,
        };
  if (serializedBytes > DATA_LIMIT_BYTES) {
    warnings.push({
      code: 'result_data_omitted',
      message: 'Result data exceeded the 256 KiB envelope limit and was omitted.',
    });
  }

  const outcome = outcomeFields(input.result.outcome);
  return {
    schemaVersion: '1.0.0',
    plugin: { id: 'subzerodev.github', version: input.pluginVersion },
    command: input.command,
    ...outcome,
    summary: input.result.summary,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    data: boundedData,
    warnings,
    errors: input.result.errors ?? [],
    artifacts: input.result.artifacts ?? [],
    metrics: input.result.metrics ?? {},
  };
}

export function writeEnvelope(envelope: ResultEnvelope, stdout: NodeJS.WritableStream): void {
  stdout.write(`${JSON.stringify(envelope)}\n`);
}

function outcomeFields(outcome: CommandOutcome): Pick<ResultEnvelope, 'status' | 'exitCode'> {
  switch (outcome.kind) {
    case 'succeeded':
      return { status: 'succeeded', exitCode: 0 };
    case 'partial':
      return { status: 'partial', exitCode: 4 };
    case 'failed':
      return { status: 'failed', exitCode: outcome.exitCode };
    case 'cancelled':
      return { status: 'cancelled', exitCode: 130 };
    case 'timedOut':
      return { status: 'timedOut', exitCode: 124 };
  }
}
