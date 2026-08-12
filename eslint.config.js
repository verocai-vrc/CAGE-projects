import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const enginePurityMessage =
  '/engine must stay pure (DESIGN.md Appendix B): no imports from /ui, /state, or /career, and no Math.random, Date, window, or document.';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['src/engine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/ui/**', '**/state/**', '**/career/**'],
              message: enginePurityMessage,
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: enginePurityMessage },
        { name: 'document', message: enginePurityMessage },
        { name: 'Date', message: enginePurityMessage },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: enginePurityMessage,
        },
      ],
    },
  },
);
