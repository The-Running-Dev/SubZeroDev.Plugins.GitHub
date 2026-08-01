import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse } from 'yaml';

const [tag, imageVersion] = process.argv.slice(2);
if (tag === undefined || imageVersion === undefined) {
  throw new Error('Usage: check-release-version <v-tag> <image-version>');
}
const packageVersion = (
  JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }
).version;
const manifestVersion = (parse(readFileSync(resolve('plugin.yaml'), 'utf8')) as { version: string })
  .version;
const tagVersion = tag.startsWith('v') ? tag.slice(1) : tag;
const versions = { packageVersion, manifestVersion, tagVersion, imageVersion };
if (new Set(Object.values(versions)).size !== 1) {
  throw new Error(`Release versions disagree: ${JSON.stringify(versions)}`);
}
