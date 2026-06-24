import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import pluginReact from 'eslint-plugin-react';
import importX from 'eslint-plugin-import-x';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'vite.config.ts'],
  },
  {
    // Base configuration for all JS and TS files
    extends: [js.configs.recommended, importX.flatConfigs.recommended],
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      importX,
    },
    settings: {
      'import-x/resolver': {
        node: {
          extensions: ['.js', '.cjs', '.mjs', '.ts', '.tsx'],
        },
      },
    },
  },
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'script' },
  },
  {
    // Type-aware rules (strict)
    files: ['**/*.{ts,tsx}'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      importX.flatConfigs.typescript,
    ],
    rules: {
      // Module resolution is currently unreliable in this repo setup (Node built-ins + ESM/TS).
      // Disable resolution-based rules to unblock real TS issues.
      'import-x/no-unresolved': 'off',
      'import-x/namespace': 'off',
      'import-x/default': 'off',
      'import-x/no-named-as-default': 'off',
      'import-x/no-named-as-default-member': 'off',
      'import-x/no-duplicates': 'off',
    },
    ignores: ['eslint.config.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Frontend specific configuration (React)
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      react: pluginReact,
    },
    rules: {
      ...(pluginReact.configs.flat.recommended?.rules ?? {}),
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  eslintConfigPrettier
);
