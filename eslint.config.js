import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const enginePurityMessage =
  '/engine must stay pure (DESIGN.md Appendix B): no imports from /ui, /state, or /career, and no Math.random, Date, window, or document.';

// Loop 7.10 (DESIGN.md §16.6): /narration joins the Appendix B purity list.
// §16.6's contract is that "a replayed seed narrates identically" — narration
// draws from its own seeded stream and consumes exactly one rng.next() per beat.
// A Math.random or a clock read anywhere in the selector would break replay
// silently, and the failure would surface as "the corner call re-narrated the
// prefix differently", which is nearly impossible to debug after the fact.
//
// /state is exempt from the import ban: the pools are Zod-validated against
// schemas that live there (§2 keeps every content schema in one file). Nothing
// else in /state is reachable from a narration module, and /engine, /ui and
// /career all remain forbidden.
const narrationPurityMessage =
  '/narration must stay pure (DESIGN.md §16.6, Appendix B): no imports from /engine, /ui, or /career, and no Math.random, Date, window, or document. Narration must replay identically from a seed.';

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
  {
    files: ['src/narration/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/engine/**', '**/ui/**', '**/career/**'],
              message: narrationPurityMessage,
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: narrationPurityMessage },
        { name: 'document', message: narrationPurityMessage },
        { name: 'Date', message: narrationPurityMessage },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: narrationPurityMessage,
        },
      ],
    },
  },
);
