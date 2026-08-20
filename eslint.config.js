import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const enginePurityMessage =
  '/engine must stay pure (DESIGN.md Appendix B): no imports from /ui, /state, /career, or /narration, and no Math.random, Date, window, or document.';

// Loop 7.10/7.11 (DESIGN.md §16.6): /narration's half of the Appendix B list.
// §16.6's contract is that "a replayed seed narrates identically" — narration
// draws from its own seeded stream and consumes exactly one rng.next() per beat.
// A Math.random or a clock read anywhere in the selector would break replay
// silently, and the failure would surface as "the corner call re-narrated the
// prefix differently", which is nearly impossible to debug after the fact.
//
// Loop 7.11 corrected the direction of this rule. Appendix B reads:
//
//   /engine imports nothing from /ui, /state, /career, /narration.
//   /narration imports nothing from /ui or /state.
//
// Loop 7.10 implemented it as "/narration imports nothing from /engine", which
// is a different rule — it forced beat extraction to re-declare the event union
// structurally rather than reading FightResult, and it left the actual
// requirement (/engine must not reach into /narration) unenforced. Beat
// extraction is a fold over FightResult; importing the engine's TYPES is the
// point, and a duplicated union would drift from the engine silently.
//
// /state is banned as Appendix B says. The narration content loader therefore
// lives in /content (content/narration.ts) alongside the other content loaders,
// where importing the Zod schema from /state is legitimate — that also keeps
// §2's "every content schema in one file" intact.
const narrationPurityMessage =
  '/narration must stay pure (DESIGN.md §16.6, Appendix B): no imports from /ui or /state, and no Math.random, Date, window, or document. Narration must replay identically from a seed. Content loading belongs in /content, not here.';

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
              group: ['**/ui/**', '**/state/**', '**/career/**', '**/narration/**'],
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
              group: ['**/ui/**', '**/state/**'],
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
