import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

export function assertReleaseVersions(input: {
  readonly packageVersion: string;
  readonly manifestVersion: string;
  readonly tag: string;
  readonly imageVersion: string;
}): void {
  if (!input.tag.startsWith('v')) {
    throw new Error(`Release tag must be v-prefixed: ${input.tag}`);
  }
  const versions = {
    packageVersion: input.packageVersion,
    manifestVersion: input.manifestVersion,
    tagVersion: input.tag.slice(1),
    imageVersion: input.imageVersion,
  };
  if (new Set(Object.values(versions)).size !== 1) {
    throw new Error(`Release versions disagree: ${JSON.stringify(versions)}`);
  }
}

function main(): void {
  const [tag, imageVersion] = process.argv.slice(2);
  if (tag === undefined || imageVersion === undefined) {
    throw new Error('Usage: check-release-version <v-tag> <image-version>');
  }
  const packageVersion = (
    JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }
  ).version;
  const manifestVersion = (
    parse(readFileSync(resolve('plugin.yaml'), 'utf8')) as { version: string }
  ).version;
  assertReleaseVersions({ packageVersion, manifestVersion, tag, imageVersion });
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
