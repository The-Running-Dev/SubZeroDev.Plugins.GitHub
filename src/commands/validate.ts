import { validateProvider } from '../services/validation-service.js';
import { VALIDATE_OPTIONS } from '../models/command-options.js';

import type { OperationalCommandModule } from './types.js';

export const validateCommand: OperationalCommandModule = {
  name: 'validate',
  options: VALIDATE_OPTIONS,
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

export { VALIDATE_OPTIONS };

export default validateCommand;
