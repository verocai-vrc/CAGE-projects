// check-content.mjs — Loop 7.6: the trademark content lint DESIGN.md §16.9
// requires, run in CI over every JSON file under src/content.
//
//   node scripts/check-content.mjs
//   npm run lint:content
//
// §13 is a legal constraint, not a style note: no UFC, "Octagon" is a separately
// held Zuffa mark, the promotion is fictional, and "do not model real athletes."
// §16.9 makes that enforceable — "a CI content lint runs a denylist regex across
// every JSON file under /content (org names, 'octagon', 'zuffa', and a list of
// real fighters' nicknames) and fails the build on any hit."
//
// Two kinds of check, because one regex cannot do both jobs honestly:
//
//   MARKS are banned as substrings, anywhere, in any string. "Octagon" is not
//   allowed to appear inside a longer phrase either.
//
//   MONIKERS are banned as whole values, compared case- and punctuation-
//   insensitively with a leading "the" ignored. Substring matching would be
//   useless here: "Bones" would reject the word "bones" in a life-event
//   sentence, and every real nickname is made of ordinary English words. What
//   must not happen is a fighter *called* one of these.
//
// Loop 7.13/7.15 extend this to content/narration/*.json; it already walks the
// whole directory, so those files are covered the moment they exist.

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONTENT = join(ROOT, 'src', 'content');

/** Promotion, venue, and org marks. Banned as substrings, anywhere. */
export const BANNED_MARKS = [
  'ufc',
  'octagon',
  'zuffa',
  'bellator',
  'strikeforce',
  'invicta',
  'pride fc',
  'one championship',
  'dana white',
  'endeavor',
];

/**
 * Real fighters' monikers. Banned as whole values.
 *
 * The list is not meant to be exhaustive — no list of this kind can be. It is
 * meant to catch the ones an author or a generated combination is actually
 * likely to land on, and to fail loudly enough that "is this someone's?" gets
 * asked before a pool is committed.
 */
export const BANNED_MONIKERS = [
  'notorious', 'bones', 'rowdy', 'spider', 'last stylebender', 'stylebender',
  'diamond', 'el cucuy', 'cucuy', 'wonderboy', 'thug', 'bullet', 'cyborg',
  'mighty mouse', 'korean zombie', 'platinum', 'gamebred', 'eagle', 'blessed',
  'reaper', 'count', 'rampage', 'prodigy', 'axe murderer', 'natural', 'dragon',
  'showtime', 'sugar', 'suga', 'poatan', 'borz', 'do bronx', 'chito',
  'iron', 'baddest man on the planet', 'money', 'pretty boy', 'hitman',
  'california kid', 'huntington beach bad boy', 'the american gangster',
  'crippler', 'janitor', 'phenom', 'dean of mean', 'smashing machine',
  'ruthless', 'the young assassin', 'stun gun', 'the last emperor',
];

/** Lowercased, punctuation-stripped, leading "the" dropped, spaces collapsed. */
function normalise(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the /, '');
}

const MONIKER_SET = new Set(BANNED_MONIKERS.map(normalise));

/**
 * Check one string. Returns a reason, or null if it is clean.
 * Exported so tests can enumerate a generated product space (every
 * {adjective} {noun} a nickname pool can produce) through the same rules the
 * CI lint applies to authored strings.
 */
export function denyReason(value) {
  const lower = value.toLowerCase();
  for (const mark of BANNED_MARKS) {
    if (lower.includes(mark)) return `contains the banned mark "${mark}" (§13)`;
  }
  if (MONIKER_SET.has(normalise(value))) {
    return `is a real fighter's moniker (§13 — do not model real athletes)`;
  }
  return null;
}

function jsonFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsonFiles(path));
    else if (entry.name.endsWith('.json')) out.push(path);
  }
  return out;
}

/** Every string value in a parsed JSON tree, with a dotted path to each. */
function* strings(node, path = '') {
  if (typeof node === 'string') yield [path, node];
  else if (Array.isArray(node)) {
    for (const [i, child] of node.entries()) yield* strings(child, `${path}[${i}]`);
  } else if (node && typeof node === 'object') {
    for (const [key, child] of Object.entries(node)) yield* strings(child, path ? `${path}.${key}` : key);
  }
}

export function checkContentDir(dir = CONTENT) {
  const violations = [];
  for (const file of jsonFiles(dir)) {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    for (const [path, value] of strings(parsed)) {
      const reason = denyReason(value);
      if (reason) violations.push({ file: relative(ROOT, file), path, value, reason });
    }
  }
  return violations;
}

// Only run the report when invoked directly, so importing the rules from a
// test does not exit the process.
if (process.argv[1] && process.argv[1].endsWith('check-content.mjs')) {
  const files = jsonFiles(CONTENT).length;
  const violations = checkContentDir();

  console.log('');
  console.log(`§13/§16.9 trademark content lint — ${files} JSON files under src/content`);
  console.log('');

  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`  FAIL  ${v.file}  ${v.path}`);
      console.error(`        "${v.value}" ${v.reason}`);
    }
    console.error('');
    console.error(`CONTENT LINT FAIL: ${violations.length} denied string(s).`);
    console.error('DESIGN.md §13 is a legal constraint, not a style note. Rename the content;');
    console.error('do not widen the denylist to make a hit go away.');
    process.exit(1);
  }
  console.log(`CONTENT LINT PASS: no denied strings (${BANNED_MARKS.length} marks, ${BANNED_MONIKERS.length} monikers).`);
}
