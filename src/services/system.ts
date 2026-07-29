import { setTimeout as delay } from 'node:timers/promises';

import type { Clock, Sleeper } from './ports.js';

export const systemClock: Clock = { now: () => new Date() };
export const systemSleeper: Sleeper = {
  sleep: (milliseconds, signal) => delay(milliseconds, undefined, { signal }),
};
