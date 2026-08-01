import { stringify } from 'yaml';

import { sortKeysDeep, type JsonValue } from './canonical-json.js';

export function stringifyCanonicalYaml(value: JsonValue): string {
  const serialized = stringify(sortKeysDeep(value), {
    lineWidth: 0,
    indent: 2,
    defaultKeyType: 'PLAIN',
    defaultStringType: 'QUOTE_DOUBLE',
    doubleQuotedAsJSON: true,
  });
  return `${serialized.replace(/\r\n?/g, '\n').replace(/\n+$/u, '')}\n`;
}
