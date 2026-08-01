import type { Clock, Sleeper } from '../../services/ports.js';

const WINDOW_MILLISECONDS = 60_000;

/** Serializes Search API admission so concurrent repository collectors share one rolling window. */
export class SearchRequestPacer {
  private readonly admittedAt: number[] = [];
  private queue: Promise<void> = Promise.resolve();

  public constructor(
    private readonly requestsPerMinute: number,
    private readonly clock: Clock,
    private readonly sleeper: Sleeper,
  ) {
    if (!Number.isSafeInteger(requestsPerMinute) || requestsPerMinute < 1) {
      throw new RangeError('Search requests per minute must be a positive safe integer.');
    }
  }

  public wait(): Promise<void> {
    const admitted = this.queue.then(() => this.waitForWindow());
    this.queue = admitted.catch(() => undefined);
    return admitted;
  }

  private async waitForWindow(): Promise<void> {
    for (;;) {
      const now = this.clock.now().getTime();
      while (this.admittedAt[0] !== undefined && this.admittedAt[0] <= now - WINDOW_MILLISECONDS) {
        this.admittedAt.shift();
      }
      if (this.admittedAt.length < this.requestsPerMinute) {
        this.admittedAt.push(now);
        return;
      }

      const oldest = this.admittedAt[0];
      if (oldest === undefined) continue;
      await this.sleeper.sleep(oldest + WINDOW_MILLISECONDS - now);
    }
  }
}
