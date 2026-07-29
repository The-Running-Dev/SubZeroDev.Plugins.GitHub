import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'docs'],
  },
  eslint.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/providers/github/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@octokit/*'],
              message: 'Octokit is confined to src/providers/github/.',
            },
          ],
        },
      ],
    },
  },
);
