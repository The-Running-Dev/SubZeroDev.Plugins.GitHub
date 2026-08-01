import { z } from 'zod';

import { portfolioOverrideSchema, type PortfolioOverride } from '../models/portfolio.js';
import type { Project } from '../models/project.js';
import type { FileSystemPort } from './ports.js';

const overrideEntrySchema = z
  .object({
    providerId: z.string().min(1),
    slug: z.string().min(1).optional(),
    portfolio: portfolioOverrideSchema.partial().strict(),
  })
  .strict();

const overrideFileSchema = z
  .object({
    schemaVersion: z.literal('1.0.0'),
    overrides: z.array(overrideEntrySchema),
  })
  .strict();

export type PortfolioOverrides = ReadonlyMap<string, Partial<PortfolioOverride>>;

export class PortfolioOverrideError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PortfolioOverrideError';
  }
}

export async function loadPortfolioOverrides(
  fileSystem: FileSystemPort,
  path: string | null,
): Promise<PortfolioOverrides> {
  if (path === null) return new Map();
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(await fileSystem.readFile(path)));
    const file = overrideFileSchema.parse(parsed);
    const overrides = new Map<string, Partial<PortfolioOverride>>();
    for (const entry of file.overrides) {
      if (overrides.has(entry.providerId)) {
        throw new PortfolioOverrideError(
          `Portfolio overrides contain duplicate provider ID ${entry.providerId}.`,
        );
      }
      overrides.set(
        entry.providerId,
        Object.fromEntries(
          Object.entries(entry.portfolio).filter(([, value]) => value !== undefined),
        ),
      );
    }
    return overrides;
  } catch (error: unknown) {
    if (error instanceof PortfolioOverrideError) throw error;
    throw new PortfolioOverrideError(
      `Could not load portfolio overrides at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function applyPortfolioOverride(project: Project, overrides: PortfolioOverrides): Project {
  const override = overrides.get(project.repository.identity.providerId);
  return override === undefined
    ? project
    : { ...project, portfolio: { ...project.portfolio, ...override } };
}

export function applyPortfolioOverrides(
  projects: readonly Project[],
  overrides: PortfolioOverrides,
): readonly Project[] {
  return projects.map((project) => applyPortfolioOverride(project, overrides));
}
