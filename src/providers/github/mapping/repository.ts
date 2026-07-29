import { z } from 'zod';

import { repositorySchema, type Repository } from '../../../models/repository.js';

const nullableText = z
  .string()
  .nullable()
  .optional()
  .transform((value) => value ?? null);

/** Minimum stable shape used from both `/user/repos` and `/repos/{owner}/{repo}`. */
export const githubRepositorySchema = z.object({
  id: z.number().int().nonnegative(),
  node_id: z.string().optional(),
  name: z.string().min(1),
  full_name: z.string().min(1),
  owner: z.object({ login: z.string().min(1), id: z.number().int().nonnegative() }),
  private: z.boolean(),
  visibility: z.enum(['public', 'private', 'internal']).nullable().optional(),
  description: nullableText,
  fork: z.boolean(),
  archived: z.boolean(),
  disabled: z.boolean(),
  is_template: z.boolean(),
  created_at: nullableText,
  updated_at: nullableText,
  pushed_at: nullableText,
  default_branch: nullableText,
  homepage: nullableText,
  html_url: z.url(),
  clone_url: z.url(),
  ssh_url: z.string().min(1),
  topics: z.array(z.string().min(1)).optional().default([]),
  license: z
    .object({ spdx_id: z.string().min(1).nullable().optional(), key: z.string().min(1) })
    .nullable()
    .optional(),
  language: nullableText,
  has_issues: z.boolean(),
  has_projects: z.boolean(),
  has_wiki: z.boolean(),
  has_pages: z.boolean(),
  has_downloads: z.boolean(),
  has_discussions: z.boolean(),
});

export type GitHubRepository = z.infer<typeof githubRepositorySchema>;

export function mapRepository(
  source: GitHubRepository,
  options: { readonly documentationUrlTemplate?: string | null } = {},
): Repository {
  const documentationUrl = expandDocumentationUrl(
    options.documentationUrlTemplate ?? null,
    source.owner.login,
    source.name,
  );
  return repositorySchema.parse({
    identity: { provider: 'github', providerId: String(source.id) },
    owner: source.owner.login,
    name: source.name,
    slug: source.full_name,
    description: source.description,
    visibility: source.visibility ?? (source.private ? 'private' : 'public'),
    status: source.archived ? 'archived' : 'active',
    isFork: source.fork,
    isDisabled: source.disabled,
    isTemplate: source.is_template,
    createdAt: normalizeTimestamp(source.created_at),
    updatedAt: normalizeTimestamp(source.updated_at),
    pushedAt: normalizeTimestamp(source.pushed_at),
    defaultBranch: source.default_branch,
    homepageUrl: normalizeUrl(source.homepage),
    documentationUrl,
    webUrl: source.html_url,
    cloneUrl: source.clone_url,
    sshUrl: source.ssh_url,
    topics: [...source.topics].sort(),
    license: source.license?.spdx_id ?? source.license?.key ?? null,
    primaryLanguage: source.language,
    capabilities: {
      issues: source.has_issues,
      projects: source.has_projects,
      wiki: source.has_wiki,
      pages: source.has_pages,
      downloads: source.has_downloads,
      discussions: source.has_discussions,
    },
  });
}

function normalizeTimestamp(value: string | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeUrl(value: string | null): string | null {
  if (value === null || value.length === 0) return null;
  return z.url().safeParse(value).success ? value : null;
}

function expandDocumentationUrl(
  template: string | null,
  owner: string,
  name: string,
): string | null {
  if (template === null) return null;
  const expanded = template.replaceAll('{owner}', owner).replaceAll('{name}', name);
  return z.url().safeParse(expanded).success ? expanded : null;
}
