// sprite.spec.ts — Loop 6.3: DESIGN.md §15.5's rules, enforced rather than promised.
//
// Three things this locks down:
//   1. No emoji flag ever enters the source. §15.5 calls this out because Windows
//      renders regional indicator sequences as bare letter pairs.
//   2. The sprite stays inside its 1.5KB budget.
//   3. Every symbol id the lookup can return actually exists in the defs block —
//      the structural version of "never a broken or missing glyph".

/// <reference types="node" />

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FLAG_SYMBOLS, flagSymbolId, hasFlag } from '../src/ui/sprite/flags';
import { SCENE_PLATES, scenePlateSymbolId } from '../src/ui/sprite/scenePlates';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const SPRITE = readFileSync(fileURLToPath(new URL('../src/ui/sprite/Sprite.tsx', import.meta.url)), 'utf-8');
const PLATE_SPRITE = readFileSync(
  fileURLToPath(new URL('../src/ui/sprite/PlateSprite.tsx', import.meta.url)),
  'utf-8',
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|css|json|html)$/.test(entry) ? [full] : [];
  });
}

describe('no emoji flags anywhere in the source (§15.5)', () => {
  // Regional indicator symbols — the codepoints emoji flags are built from.
  const REGIONAL_INDICATOR = /[\u{1F1E6}-\u{1F1FF}]/u;

  it('finds zero regional indicator codepoints under src/', () => {
    const offenders = sourceFiles(SRC).filter((f) =>
      REGIONAL_INDICATOR.test(readFileSync(f, 'utf-8')),
    );
    expect(offenders).toEqual([]);
  });
});

describe('sprite budget (§15.5: ≤1.5KB for all five flags)', () => {
  it('keeps the rendered markup under 1.5KB', () => {
    // Anchor on the JSX element, not the first '<svg' in the file — the header
    // comment mentions one, and slicing from there counts prose as artwork.
    const markup = SPRITE.slice(SPRITE.indexOf('<svg class='), SPRITE.lastIndexOf('</svg>') + 6)
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '') // JSX comments never ship
      .replace(/>\s+</g, '><')
      .replace(/\s+/g, ' ')
      .trim();
    expect(markup.length).toBeLessThanOrEqual(1536);
  });
});

describe('the nationality lookup is total (§15.5: never a broken glyph)', () => {
  it.each(['Brazil', 'Ireland', 'Japan', 'Poland', 'USA'])(
    'resolves %s to its own flag',
    (nationality) => {
      const id = flagSymbolId(nationality);
      expect(id).not.toBe('flag-neutral');
      expect(hasFlag(nationality)).toBe(true);
    },
  );

  // The two sentinels §15.5 names, plus the shapes a future content edit could
  // produce. None of them may resolve to nothing.
  it.each(['lab', 'fixture', '', 'Wakanda', 'usa', 'BRAZIL'])(
    'falls back to the neutral field for %j',
    (nationality) => {
      expect(flagSymbolId(nationality)).toBe('flag-neutral');
      expect(hasFlag(nationality)).toBe(false);
    },
  );

  it('never returns a symbol the sprite does not define', () => {
    for (const id of FLAG_SYMBOLS) {
      expect(SPRITE).toContain(`id="${id}"`);
    }
  });

  it('defines a symbol for every nationality in the shipped name pools', async () => {
    // The real guard: if a name pool gains a nationality and nobody draws its flag,
    // this fails here rather than showing a hatched box to a player.
    const { namePools } = await import('../src/content');
    for (const pool of namePools) {
      expect(hasFlag(pool.nationality)).toBe(true);
    }
  });
});

describe('scene plate budget (§15.6: ≤6KB for all six plates)', () => {
  it('keeps the combined plate markup under 6KB', () => {
    const markup = PLATE_SPRITE.slice(
      PLATE_SPRITE.indexOf('<symbol'),
      PLATE_SPRITE.lastIndexOf('</symbol>') + 9,
    )
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/>\s+</g, '><')
      .replace(/\s+/g, ' ')
      .trim();
    expect(markup.length).toBeLessThanOrEqual(6144);
  });

  it('never returns a symbol the plate sprite does not define', () => {
    for (const plate of SCENE_PLATES) {
      expect(PLATE_SPRITE).toContain(`id="${scenePlateSymbolId(plate)}"`);
    }
  });
});
