import { resolve } from 'node:path';

import { EXPORT_OPTIONS } from '../models/command-options.js';
import { failedOutcome } from './outcome.js';
import {
  ExportError,
  exportCachedProjects,
  previewCachedProjects,
} from '../services/export-service.js';
import type { OutputFormat } from '../serialization/documents.js';
import { loadPortfolioOverrides } from '../services/portfolio-service.js';

import type { OperationalCommandModule } from './types.js';

export { EXPORT_OPTIONS };

export const exportCommand: OperationalCommandModule = {
  name: 'export',
  options: EXPORT_OPTIONS,
  requiresContext: true,
  sideEffecting: true,
  async run(context, invocation) {
    const formats = resolveFormats(
      invocation.values['format'],
      context.configuration.output.formats,
    );
    if (formats === null) {
      return {
        outcome: failedOutcome('usage'),
        summary: 'Export format is invalid.',
        errors: [
          {
            code: 'invalid_export_format',
            message: 'Every --format value must be json or yaml.',
            retryable: false,
          },
        ],
      };
    }
    try {
      const portfolioOverrides = await loadPortfolioOverrides(
        context.fileSystem,
        context.configuration.portfolio.overrides,
      );
      const outputDirectory = resolve(
        invocation.values['output'] === undefined
          ? context.configuration.directories.output
          : String(invocation.values['output']),
      );
      const result = invocation.global.dryRun
        ? await previewCachedProjects({
            cache: context.cache,
            formats,
            reclaim: false,
            portfolioOverrides,
          })
        : await exportCachedProjects({
            cache: context.cache,
            fileSystem: context.fileSystem,
            outputDirectory,
            formats,
            portfolioOverrides,
          });
      return {
        outcome: { kind: 'succeeded' },
        summary: invocation.global.dryRun
          ? `Prepared ${String(result.artifacts.length)} export artifacts without writing them.`
          : `Exported ${String(result.artifacts.length)} artifacts.`,
        data: { dryRun: invocation.global.dryRun, outputDirectory },
        artifacts: result.artifacts,
      };
    } catch (error: unknown) {
      if (error instanceof ExportError) {
        return {
          outcome: failedOutcome('operational'),
          summary: 'Project export failed.',
          errors: [{ code: 'export_failed', message: error.message, retryable: false }],
        };
      }
      throw error;
    }
  },
};

function resolveFormats(
  value: string | boolean | readonly string[] | undefined,
  fallback: readonly OutputFormat[],
): readonly OutputFormat[] | null {
  const values = value === undefined ? fallback : Array.isArray(value) ? value : [String(value)];
  return values.every((format): format is OutputFormat => format === 'json' || format === 'yaml')
    ? values
    : null;
}

export default exportCommand;
