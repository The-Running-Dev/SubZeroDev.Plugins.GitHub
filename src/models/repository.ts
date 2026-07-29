import { z } from 'zod';

import { projectIdentitySchema } from './identity.js';
import {
  nonEmptyStringSchema,
  nullableStringSchema,
  nullableTimestampSchema,
  nullableUrlSchema,
} from './primitives.js';

export const repositoryVisibilitySchema = z.enum(['public', 'private', 'internal', 'unknown']);
export const projectStatusSchema = z.enum(['active', 'archived']);

export const repositorySchema = z.object({
  identity: projectIdentitySchema,
  owner: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  slug: nonEmptyStringSchema,
  description: nullableStringSchema,
  visibility: repositoryVisibilitySchema,
  status: projectStatusSchema,
  isFork: z.boolean(),
  isDisabled: z.boolean(),
  isTemplate: z.boolean(),
  createdAt: nullableTimestampSchema,
  updatedAt: nullableTimestampSchema,
  pushedAt: nullableTimestampSchema,
  defaultBranch: nullableStringSchema,
  homepageUrl: nullableUrlSchema,
  documentationUrl: nullableUrlSchema,
  webUrl: nullableUrlSchema,
  cloneUrl: nullableUrlSchema,
  sshUrl: nullableStringSchema,
  topics: z.array(nonEmptyStringSchema),
  license: nullableStringSchema,
  primaryLanguage: nullableStringSchema,
  capabilities: z.object({
    issues: z.boolean(),
    projects: z.boolean(),
    wiki: z.boolean(),
    pages: z.boolean(),
    downloads: z.boolean(),
    discussions: z.boolean(),
  }),
});

export type RepositoryVisibility = z.infer<typeof repositoryVisibilitySchema>;
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type Repository = z.infer<typeof repositorySchema>;
