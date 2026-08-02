import type { ParseArgsOptionsConfig } from 'node:util';

import { GLOBAL_OPTIONS } from '../commands/global-options.js';
import { COMMAND_OPTIONS } from '../models/command-options.js';
import type { CommandName } from '../commands/types.js';
import type { JsonObject } from './canonical-json.js';

export function buildCommandInputSchema(command: CommandName): JsonObject {
  const options: ParseArgsOptionsConfig = { ...GLOBAL_OPTIONS, ...COMMAND_OPTIONS[command] };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://plugins-github.subzerodev.com/schemas/commands/${command}.input.schema.json`,
    title: `${command} command input`,
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(
      Object.entries(options).map(([name, definitionValue]) => {
        const definition = definitionValue as {
          readonly type: 'string' | 'boolean';
          readonly multiple?: boolean;
        };
        return [
          name,
          definition.multiple === true
            ? { type: 'array', items: { type: definition.type } }
            : { type: definition.type },
        ];
      }),
    ),
  };
}
