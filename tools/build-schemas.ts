import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { COMMAND_NAMES } from '../src/commands/types.js';
import { buildCommandInputSchema } from '../src/serialization/command-schema.js';
import { stringifyCanonical } from '../src/serialization/canonical-json.js';
import { buildProjectsJsonSchema } from '../src/serialization/json-schema.js';

const destination = resolve('schemas/projects.schema.json');
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, stringifyCanonical(buildProjectsJsonSchema()), 'utf8');

for (const command of COMMAND_NAMES) {
  const commandDestination = resolve(`schemas/commands/${command}.input.schema.json`);
  await mkdir(dirname(commandDestination), { recursive: true });
  await writeFile(commandDestination, stringifyCanonical(buildCommandInputSchema(command)), 'utf8');
}
