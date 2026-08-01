import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  materializeReleaseManifest,
  serializeReleaseManifest,
  writeReleaseArtifacts,
} from '../../tools/build-release-manifest.js';
import { assertReleaseVersions } from '../../tools/check-release-version.js';

interface ReleaseManifestFixture {
  readonly runtimes: readonly { readonly development: boolean }[];
}

describe('release readiness', () => {
  it('materializes one production manifest for every packaged surface', () => {
    const source = parse(readFileSync(resolve('plugin.yaml'), 'utf8')) as {
      runtimes: { type: string; development?: boolean; digest?: string }[];
    };
    const digest = `sha256:${'a'.repeat(64)}`;
    const release = materializeReleaseManifest(source, digest);

    expect(release.runtimes.every(({ development }) => development === false)).toBe(true);
    expect(release.runtimes.find(({ type }) => type === 'docker')?.digest).toBe(digest);
    expect(source.runtimes.every(({ development }) => development === true)).toBe(true);
    const serialized = serializeReleaseManifest(release);
    expect(parse(serialized.yaml)).toEqual(JSON.parse(serialized.json));
  });

  it('writes identical schema-valid release, CLI, and package manifests', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'subzerodev-release-'));
    try {
      mkdirSync(resolve(temporary, 'schemas/contract'), { recursive: true });
      copyFileSync(resolve('plugin.yaml'), resolve(temporary, 'plugin.yaml'));
      copyFileSync(
        resolve('schemas/contract/plugin-manifest.schema.json'),
        resolve(temporary, 'schemas/contract/plugin-manifest.schema.json'),
      );
      const digest = `sha256:${'b'.repeat(64)}`;

      writeReleaseArtifacts(temporary, digest);

      const packaged = parse(
        readFileSync(resolve(temporary, 'plugin.yaml'), 'utf8'),
      ) as ReleaseManifestFixture;
      const cli = JSON.parse(
        readFileSync(resolve(temporary, 'dist/plugin.manifest.json'), 'utf8'),
      ) as ReleaseManifestFixture;
      const attached = JSON.parse(
        readFileSync(resolve(temporary, 'release/plugin.manifest.json'), 'utf8'),
      ) as ReleaseManifestFixture;
      expect(packaged).toEqual(cli);
      expect(attached).toEqual(cli);
      expect(cli.runtimes.every(({ development }) => !development)).toBe(true);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it('publishes both declared architectures with signed and attested artifacts', () => {
    const workflow = readFileSync(resolve('.github/workflows/release.yml'), 'utf8');

    expect(workflow).toContain('docker/setup-qemu-action@v3');
    expect(workflow).toContain('platforms: linux/amd64,linux/arm64');
    expect(workflow).toContain('cosign sign --yes');
    expect(workflow).toContain('gh attestation sign --subject-path release/plugin.manifest.json');
    expect(workflow).toContain('npm publish ./*.tgz --provenance --access public --ignore-scripts');
    expect(workflow).toContain('gh release create');
  });

  it('refuses unprefixed tags and any version disagreement', () => {
    const versions = {
      packageVersion: '0.1.0',
      manifestVersion: '0.1.0',
      tag: 'v0.1.0',
      imageVersion: '0.1.0',
    };

    expect(() => {
      assertReleaseVersions(versions);
    }).not.toThrow();
    expect(() => {
      assertReleaseVersions({ ...versions, tag: '0.1.0' });
    }).toThrow('v-prefixed');
    expect(() => {
      assertReleaseVersions({ ...versions, imageVersion: '0.1.1' });
    }).toThrow('disagree');
  });
});
