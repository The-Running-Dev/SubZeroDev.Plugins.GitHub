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
    // Tests are in scope too: the invariant is that no GitHub client type reaches a
    // provider-neutral module, and a test is where the first "just for a type" import
    // would otherwise be written.
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    ignores: ['src/providers/github/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@octokit/*'],
              // ADR-003 removed the dependency; the rule stays as the guard against a
              // reintroduction landing outside the adapter.
              message: 'A GitHub API client is confined to src/providers/github/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/models/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../providers/**', '../../src/providers/**', '@octokit/*'],
              message: 'Provider-specific types are forbidden in provider-neutral domain models.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/commands/manifest.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../configuration/**',
                '../providers/**',
                '../cache/**',
                '../services/**',
                'pino',
                '@octokit/*',
                'yaml',
              ],
              message: 'The bare manifest command must not load operational dependencies.',
            },
          ],
        },
      ],
    },
  },
);
