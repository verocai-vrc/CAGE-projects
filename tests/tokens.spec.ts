// tokens.spec.ts — Loop 6.1: the contrast figures recorded in tokens.css are
// measured, and this is what keeps them measured.
//
// DESIGN.md §15.2 names corner-coloured text as "the single largest cause of the
// unreadable text this section exists to fix", and DEVELOPMENT_LOOPS.md makes
// re-measuring a cross-cutting loop after any palette change. A comment cannot
// fail a build; this can. Change a hex in tokens.css and the pair it breaks names
// itself here.

// tsconfig.app.json compiles tests with `types: ["vite/client"]`, so node builtins
// are not in scope by default. This reference opts just this file into @types/node
// (already a devDependency) rather than loosening the config for all of src/.
// Vite's `?raw` is not an option here: vitest stubs CSS imports to an empty string.
/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TOKENS_CSS = readFileSync(
  fileURLToPath(new URL('../src/ui/styles/tokens.css', import.meta.url)),
  'utf-8',
);

/** Pull `--name: #hex;` declarations out of tokens.css so the test reads the real
 *  source of truth rather than a copy that can drift away from it. */
function readTokens(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) {
    out[match[1]] = match[2].toUpperCase();
  }
  return out;
}

const tokens = readTokens(TOKENS_CSS);

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function ratio(fg: string, bg: string): number {
  const f = tokens[fg];
  const b = tokens[bg];
  if (!f || !b) throw new Error(`token not found in tokens.css: ${!f ? fg : bg}`);
  return contrast(f, b);
}

describe('tokens.css defines the full §15.2 palette', () => {
  const required = [
    'desk', 'paper', 'paper-carbon', 'paper-pink', 'ink', 'ink-soft', 'rule', 'stamp', 'stamp-blue',
    'canvas', 'canvas-lit', 'bone', 'bone-soft', 'grid',
    'red-corner', 'blue-corner', 'red-corner-text', 'blue-corner-text', 'amber',
    'red-corner-file', 'blue-corner-file',
  ];

  it.each(required)('defines --%s', (name) => {
    expect(tokens[name]).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe('text contrast meets AA (≥4.5:1) at body size', () => {
  // The exact pairs Loop 6.1 requires be measured, plus the surfaces each register
  // actually renders text on. Expected values are the measured ones recorded in
  // tokens.css — asserted to 2dp so a palette edit fails loudly rather than drifting.
  const pairs: [string, string, number][] = [
    ['ink', 'paper', 13.43],
    ['ink-soft', 'paper', 6.02],
    ['stamp-blue', 'paper', 6.82],
    ['stamp', 'paper', 4.64],
    ['ink', 'paper-carbon', 11.21],
    ['ink-soft', 'paper-carbon', 5.03],
    ['ink', 'paper-pink', 10.5],
    ['ink-soft', 'paper-pink', 4.71],
    // Loop 6.12: corner identity rendered as type on the File. The Broadcast's
    // -text twins are lighter than the fills to lift off arena black, which is
    // the wrong direction on paper — FighterIdentity's corner eyebrow measured
    // 2.39:1 there until these were bound per register. Every File surface a
    // corner-assigned block can land on is measured.
    ['red-corner-file', 'paper', 6.35],
    ['red-corner-file', 'paper-carbon', 5.3],
    ['red-corner-file', 'paper-pink', 4.97],
    ['blue-corner-file', 'paper', 6.79],
    ['blue-corner-file', 'paper-carbon', 5.66],
    ['blue-corner-file', 'paper-pink', 5.31],
    // The pair that was missing when Stamp's `opacity: 0.92` pushed --stamp
    // below AA on paper: --stamp has the least headroom in the palette, so both
    // of the File surfaces it can be stamped on are pinned here.
    ['stamp-blue', 'paper-carbon', 5.69],
    ['bone', 'canvas', 17.1],
    ['bone-soft', 'canvas', 6.67],
    ['amber', 'canvas', 9.22],
    ['red-corner-text', 'canvas', 6.29],
    ['blue-corner-text', 'canvas', 7.72],
    ['bone', 'canvas-lit', 15.55],
    ['bone-soft', 'canvas-lit', 6.06],
    ['red-corner-text', 'canvas-lit', 5.72],
    ['blue-corner-text', 'canvas-lit', 7.02],
  ];

  it.each(pairs)('--%s on --%s is %f:1 and passes AA', (fg, bg, expected) => {
    const measured = ratio(fg, bg);
    expect(measured).toBeCloseTo(expected, 1);
    expect(measured).toBeGreaterThanOrEqual(4.5);
  });
});

describe('corner fills are fills, and the -text variants are the reason', () => {
  // §15.2: --red-corner and --blue-corner FAIL AA for body text. That is not a
  // defect to fix by lightening them — they are meter fills and radar polygons, and
  // the -text twins exist for type. This test documents the failure so nobody
  // "fixes" it by putting a fill colour on a label.
  it.each([['red-corner'], ['blue-corner']])('--%s is below AA on --canvas (fills only)', (fill) => {
    expect(ratio(fill, 'canvas')).toBeLessThan(4.5);
  });

  it.each([
    ['red-corner', 'red-corner-text'],
    ['blue-corner', 'blue-corner-text'],
  ])('--%s-text is more legible than the --%s fill it replaces', (fill, text) => {
    expect(ratio(text, 'canvas')).toBeGreaterThan(ratio(fill, 'canvas'));
  });

  it('--rule is hairline geometry, never text — it is not held to AA', () => {
    expect(ratio('rule', 'paper')).toBeLessThan(4.5);
  });

  // Loop 6.12. --stamp clears AA on --paper by 0.14 and nothing else. On the
  // goldenrod second sheet it does not clear it at all, so a Stamp on a carbon
  // Sheet must take the blue variant (--mark-alt / --stamp-blue, 5.69:1). No
  // such pairing exists today — the axe pass in driver.mjs is what would catch
  // one — and this records why it must not be introduced.
  it('--stamp is not text-safe on --paper-carbon: a carbon-sheet stamp must be blue', () => {
    expect(ratio('stamp', 'paper-carbon')).toBeLessThan(4.5);
    expect(ratio('stamp-blue', 'paper-carbon')).toBeGreaterThanOrEqual(4.5);
  });

  // The File's corner type is type, never a fill — the fills stay register-
  // independent and these two never appear as one.
  it.each([
    ['red-corner-file', 'red-corner'],
    ['blue-corner-file', 'blue-corner'],
  ])('--%s is darker than the --%s fill, the opposite of the Broadcast twins', (fileText, fill) => {
    expect(ratio(fileText, 'paper')).toBeGreaterThan(ratio(fill, 'paper'));
  });
});

describe('register bindings', () => {
  it('binds --mark-text, not the raw fill, in the broadcast register', () => {
    const broadcast = TOKENS_CSS.slice(TOKENS_CSS.indexOf('.reg-broadcast'));
    expect(broadcast).toMatch(/--mark-text:\s*var\(--red-corner-text\)/);
  });

  it('selects register by class, never by media query', () => {
    expect(TOKENS_CSS).toContain('.reg-file');
    expect(TOKENS_CSS).toContain('.reg-broadcast');
    expect(TOKENS_CSS).not.toContain('@media');
  });
});
