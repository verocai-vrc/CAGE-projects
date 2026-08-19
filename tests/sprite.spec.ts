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

describe('inline SVG total (§15.9: 14KB for faces + flags + plates)', () => {
  // Loop 6.12: the one §15.9 line scripts/check-budgets.mjs cannot measure from
  // dist/. The geometry is JSX, so once minified into the bundle it is
  // indistinguishable from the components around it — but at source each family
  // lives in a file with nothing else in it, which is exactly what the per-family
  // 1.5KB and 6KB sub-budgets above already measure. This is their sum, plus the
  // face dictionary (Loop 6.4) and the wear overlays (Loop 6.6), against the 14KB
  // ceiling the two of them are carved out of.

  /** Collapse a module's JSX artwork the way the two sub-budget tests above do:
   *  strip JSX comments, collapse inter-tag whitespace, and measure what is left.
   *  Comments and formatting do not ship; markup does. */
  function markupBytes(source: string, open: string, close: string): number {
    const start = source.indexOf(open);
    const end = source.lastIndexOf(close);
    if (start < 0 || end < 0) throw new Error(`no ${open}…${close} block found`);
    return source
      .slice(start, end + close.length)
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/>\s+</g, '><')
      .replace(/\s+/g, ' ')
      .trim().length;
  }

  /** The two dictionary-driven families are not literal markup in their source —
   *  FaceSprite/WearSprite template one <symbol> per entry. Measure what those
   *  templates actually emit, so the number is the shipped defs block rather
   *  than the authoring format around it.
   *
   *  Each treatment is priced at the wrapper it ACTUALLY emits rather than at the
   *  widest one in the file. Charging every symbol the stroked wrapper's 88 bytes
   *  overstated the fill and silhouette layers by ~2.7x, and the closing </symbol>
   *  was not counted at all — an error in the safe direction on one side and the
   *  unsafe direction on the other. The three constants below are asserted against
   *  the components' own source in the test that follows, so a change to a wrapper
   *  cannot silently invalidate the arithmetic here. */
  const WRAPPER = {
    // `<path d="…"/>` — fill and stroke both inherited from the <use> site.
    silhouette: '<path d=""/>'.length,
    // `<path d="…" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>`
    stroke: '<path d="" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>'.length,
    // `<path d="…" fill="currentColor"/>`
    fill: '<path d="" fill="currentColor"/>'.length,
    // WearSprite adds an opacity to both of its branches.
    wearStroke:
      '<path d="" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.7"/>'
        .length,
    wearFill: '<path d="" fill="currentColor" opacity="0.55"/>'.length,
  };

  function symbolBytes(id: string, d: string, wrapper: number): number {
    return `<symbol id="${id}" viewBox="0 0 64 64">`.length + d.length + wrapper + '</symbol>'.length;
  }

  function dictionaryMarkupBytes(
    layers: Record<string, readonly { id: string; d?: string }[]>,
    wrapperFor: (slot: string) => number,
  ): number {
    let total = 0;
    for (const [slot, symbols] of Object.entries(layers)) {
      for (const { id, d } of symbols) {
        if (!d) continue;
        total += symbolBytes(id, d, wrapperFor(slot));
      }
    }
    return total;
  }

  /** What FaceSprite emits for the face dictionary, including the shared
   *  ears/neck/shoulders frame — which is a real symbol in the defs block even
   *  though it is not a FaceCode slot, and so has to be counted. */
  async function faceBytes(): Promise<number> {
    const { FACE_FRAME, FEATURE_LAYERS } = await import('../src/ui/portrait/features');
    const STROKE_SLOTS = new Set(['brow', 'eyes', 'nose', 'mouth']);
    const wrapperFor = (slot: string) =>
      slot === 'head' ? WRAPPER.silhouette : STROKE_SLOTS.has(slot) ? WRAPPER.stroke : WRAPPER.fill;
    return (
      symbolBytes(FACE_FRAME.id, FACE_FRAME.d, WRAPPER.silhouette) +
      dictionaryMarkupBytes(FEATURE_LAYERS, wrapperFor)
    );
  }

  async function wearBytes(): Promise<number> {
    const { WEAR_LAYERS } = await import('../src/ui/portrait/wearFeatures');
    const FILLED = new Set(['cauliflowerEar', 'swelling']);
    return dictionaryMarkupBytes(WEAR_LAYERS, (slot) =>
      FILLED.has(slot) ? WRAPPER.wearFill : WRAPPER.wearStroke,
    );
  }

  it('prices each treatment at the wrapper its component actually emits', () => {
    // The arithmetic above is only honest while these are the wrappers in the
    // source. If a treatment gains or loses an attribute, this fails here rather
    // than quietly shifting the budget by a few hundred bytes.
    const FACE_SPRITE = readFileSync(
      fileURLToPath(new URL('../src/ui/portrait/FaceSprite.tsx', import.meta.url)),
      'utf-8',
    );
    const WEAR_SPRITE = readFileSync(
      fileURLToPath(new URL('../src/ui/portrait/WearSprite.tsx', import.meta.url)),
      'utf-8',
    );

    // The silhouette treatment's whole point is that it sets neither fill nor
    // stroke, so CSS at the <use> site can drive both.
    expect(FACE_SPRITE).toContain('<path d={d} />');
    for (const source of [FACE_SPRITE, WEAR_SPRITE]) {
      expect(source).toContain('stroke="currentColor"');
      expect(source).toContain('stroke-linecap="round"');
      expect(source).toContain('fill="currentColor"');
    }
    expect(WEAR_SPRITE).toContain('opacity="0.55"');
    expect(WEAR_SPRITE).toContain('opacity="0.7"');
  });

  it('keeps faces + flags + plates + wear under 14KB of shipped markup', async () => {
    const families = {
      // Flags and plates are literal JSX; the two tests above hold each to its
      // own sub-budget, and this reads the same markup.
      flags: markupBytes(SPRITE, '<svg class=', '</svg>'),
      plates: markupBytes(PLATE_SPRITE, '<symbol', '</symbol>'),
      faces: await faceBytes(),
      wear: await wearBytes(),
    };
    const total = Object.values(families).reduce((a, b) => a + b, 0);
    // Logged so a future loop reads the real slack rather than re-deriving it.

    console.log('inline SVG markup (bytes):', families, '-> total', total, '/ 14336');
    expect(total).toBeLessThanOrEqual(14 * 1024);
  });

  it('records what §16.4 / Loop 7.7 actually has left to spend on faces', async () => {
    // §16.4 slices the 14KB as "flags take 1.5KB and plates 6KB, leaving 6.5KB
    // for faces". That derivation assumed both families would spend their full
    // sub-budget. Measured — which is what §16.4 itself asks for — they did not:
    // flags came in at ~1.1KB and plates at ~3.0KB, so the space left for the
    // face and wear dictionaries together is materially larger than 6.5KB.
    //
    // The binding constraint is therefore the 14KB total above, not the 6.5KB
    // estimate. This test pins the derivation to real numbers so Loop 7.7 sizes
    // its extension (build/marks/gear, wider hair ranges) against the space that
    // exists rather than against a figure derived from ceilings.
    const flags = markupBytes(SPRITE, '<svg class=', '</svg>');
    const plates = markupBytes(PLATE_SPRITE, '<symbol', '</symbol>');
    const faces = await faceBytes();
    const wear = await wearBytes();
    const headroom = 14 * 1024 - (flags + plates + faces + wear);


    console.log(
      `§16.4 slice, measured: flags ${flags} + plates ${plates} + faces ${faces} + wear ${wear}` +
        ` — ${headroom} bytes left for Loop 7.7's extension`,
    );

    // Faces already exceed §16.4's 6.5KB estimate, and Loop 7.7 adds three slots
    // and widens three more on top. It has headroom, but not much: if this drops
    // below zero the extension has to cut `gear` and trim `marks` as §16.4
    // instructs, rather than quietly pushing the total over 14KB.
    expect(headroom).toBeGreaterThan(0);
  });
});
