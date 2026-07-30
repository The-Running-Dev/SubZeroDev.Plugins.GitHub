import { listCachedRepositories } from '../services/list-service.js';

import type { OperationalCommandModule } from './types.js';

export const listCommand: OperationalCommandModule = {
  name: 'list',
  options: {},
  requiresContext: true,
  sideEffecting: false,
  run: (context) => listCachedRepositories(context.cache),
};

export default listCommand;
