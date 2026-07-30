import { validateProvider } from '../services/validation-service.js';

import type { OperationalCommandModule } from './types.js';

export const validateCommand: OperationalCommandModule = {
  name: 'validate',
  options: {},
  requiresContext: true,
  sideEffecting: false,
  async run(context) {
    const providerContext = await context.createProvider();
    const result = await validateProvider(providerContext.provider);
    return {
      ...result,
      warnings: [
        ...(result.warnings ?? []),
        ...providerContext.tokenNotes.map((message) => ({ code: 'token_reuse', message })),
      ],
    };
  },
};

export default validateCommand;
