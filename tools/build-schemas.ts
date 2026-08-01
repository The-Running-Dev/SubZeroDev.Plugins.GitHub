import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { stringifyCanonical } from '../src/serialization/canonical-json.js';
import { buildProjectsJsonSchema } from '../src/serialization/json-schema.js';

const destination = resolve('schemas/projects.schema.json');
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, stringifyCanonical(buildProjectsJsonSchema()), 'utf8');
