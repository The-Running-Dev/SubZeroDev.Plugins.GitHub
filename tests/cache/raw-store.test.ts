import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';

import { RawResponseStore } from '../../src/cache/raw-store.js';
import { memoryFileSystem } from '../support/fake-ports.js';

describe('optional raw response retention', () => {
  it('writes raw bodies only when explicitly invoked', async () => {
    const fileSystem = memoryFileSystem();
    expect(fileSystem.writes).toEqual([]);

    await new RawResponseStore(fileSystem, 'output').write(
      [{ name: 'repository-1-abc', contents: '{"unchanged":true}' }],
      'run',
    );

    expect(fileSystem.read(resolve('output/raw/repository-1-abc.json'))).toBe('{"unchanged":true}');
  });

  it('confines provider-supplied names to the raw directory', async () => {
    await expect(
      new RawResponseStore(memoryFileSystem(), 'output').write(
        [{ name: '../escape', contents: '{}' }],
        'run',
      ),
    ).rejects.toThrow(/escapes its directory/);
  });
});
