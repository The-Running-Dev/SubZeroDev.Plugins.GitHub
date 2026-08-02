import { z } from 'zod';

import { projectsDocumentSchema } from '../models/documents.js';
import { SCHEMA_VERSION } from '../models/schema-version.js';
import { sortKeysDeep, type JsonObject } from './canonical-json.js';

export const PROJECTS_SCHEMA_ID =
  `https://plugins-github.subzerodev.com/schemas/${SCHEMA_VERSION}/projects.schema.json` as const;

export function buildProjectsJsonSchema(): JsonObject {
  const generated = z.toJSONSchema(projectsDocumentSchema, {
    target: 'draft-2020-12',
    io: 'output',
    unrepresentable: 'throw',
  }) as JsonObject;
  return sortKeysDeep({ ...generated, $id: PROJECTS_SCHEMA_ID }) as JsonObject;
}
