import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { FileSystemPort } from '../services/ports.js';
import { StagingArea } from '../serialization/atomic-write.js';

export interface RawResponse {
  readonly name: string;
  readonly contents: string;
}

/** Optional diagnostic retention. Callers do not construct it when retention is disabled. */
export class RawResponseStore {
  public constructor(
    private readonly fileSystem: FileSystemPort,
    private readonly outputDirectory: string,
  ) {}

  public async write(
    responses: readonly RawResponse[],
    runId: string = randomUUID(),
  ): Promise<void> {
    const staging = new StagingArea(this.fileSystem, this.outputDirectory, `raw-${runId}`);
    try {
      for (const response of responses) {
        if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(response.name)) {
          throw new Error(`Raw response name escapes its directory: ${response.name}`);
        }
        await staging.stage(join('raw', `${response.name}.json`), response.contents);
      }
      await staging.commit();
    } catch (error: unknown) {
      await staging.discard();
      throw error;
    }
  }
}
