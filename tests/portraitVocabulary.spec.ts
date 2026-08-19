// Loop 7.7 — the portrait vocabulary extension (DESIGN.md §16.4).
//
// Three new slots (build, marks, gear) and three widened ones (hair, facialHair,
// hairColor), without breaking any of M6's contracts. The two that matter most
// are structural rather than visual:
//
//   * stance is read from `Fighter.stance`, never from a FaceCode slot. §16.4
//     discards the thirteenth slot because "a southpaw drawn in an orthodox
//     stance is a visible lie" — the code could disagree with the tale of the
//     tape on the same screen.
//   * marks (`mk-*`) and wear (`wr-*`) never share a namespace or a layer.
//     Marks are authored and permanent; wear is derived by faceWear and grows.
//     faceWear must never need to know a fighter is tattooed.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/engine/rng';
import {
  SLOT_COUNTS,
  SLOT_ORDER,
  faceFromSeed,
  parseFaceCode,
  serializeFaceCode,
  type FaceCode,
} from '../src/ui/portrait/faceCode';
import { FEATURE_LABELS, FEATURE_LAYERS, HAIR_COLORS, SKIN_TONES } from '../src/ui/portrait/features';
import { WEAR_LAYERS } from '../src/ui/portrait/wearFeatures';

const PORTRAIT = readFileSync('src/ui/portrait/Portrait.tsx', 'utf8');
const PORTRAIT_CSS = readFileSync('src/ui/portrait/Portrait.module.css', 'utf8');

describe('the twelve-slot code (§16.4)', () => {
  it('carries §16.4\'s three new slots at their stated ranges', () => {
    expect(SLOT_COUNTS.build).toBe(5);
    expect(SLOT_COUNTS.marks).toBe(12);
    expect(SLOT_COUNTS.gear).toBe(8);
  });

  it('widens the three existing slots §16.4 names', () => {
    expect(SLOT_COUNTS.hair).toBe(10);
    expect(SLOT_COUNTS.facialHair).toBe(8);
    expect(SLOT_COUNTS.hairColor).toBe(6);
    expect(HAIR_COLORS).toHaveLength(6);
    expect(SKIN_TONES).toHaveLength(SLOT_COUNTS.skin);
  });

  it('has no stance slot — §16.4 discards the thirteenth', () => {
    expect(SLOT_ORDER).toHaveLength(12);
    expect(SLOT_ORDER).not.toContain('stance');
  });

  it('round-trips 1,000 random twelve-character codes', () => {
    const rng = mulberry32(7707);
    for (let i = 0; i < 1000; i++) {
      const code = faceFromSeed(rng);
      const serialized = serializeFaceCode(code);
      expect(serialized).toHaveLength(12);
      expect(parseFaceCode(serialized)).toEqual(code);
    }
  });

  it('round-trips an arbitrary twelve-character string, not just generated ones', () => {
    // A save file holds a string, not a FaceCode. Every in-range string a save
    // could contain has to survive the codec unchanged.
    const rng = mulberry32(31);
    for (let i = 0; i < 1000; i++) {
      const raw = SLOT_ORDER.map((slot) =>
        Math.floor(rng.next() * SLOT_COUNTS[slot]).toString(36),
      ).join('');
      expect(serializeFaceCode(parseFaceCode(raw))).toBe(raw);
    }
  });

  it('a nine-character code from before Loop 7.7 still parses, clamped', () => {
    // Save versions are bumped for schema changes, but parseFaceCode's own
    // contract is that a malformed face never breaks a load (§11).
    const legacy = parseFaceCode('402042201');
    expect(() => legacy).not.toThrow();
    for (const slot of SLOT_ORDER) {
      expect(legacy[slot]).toBeGreaterThanOrEqual(0);
      expect(legacy[slot]).toBeLessThan(SLOT_COUNTS[slot]);
    }
  });

  it('every slot has as many labels as variants, new slots included', () => {
    for (const slot of SLOT_ORDER) {
      expect(FEATURE_LABELS[slot], `'${slot}' labels`).toHaveLength(SLOT_COUNTS[slot]);
    }
  });
});

describe('stance is a prop, not a slot (§16.4)', () => {
  it('Portrait takes stance and reads nothing about it from the code', () => {
    expect(PORTRAIT).toContain("stance?: 'orthodox' | 'southpaw'");
    // The one thing that must never appear: a stance index on the FaceCode.
    expect(PORTRAIT).not.toMatch(/code\.stance/);
    expect(Object.keys(SLOT_COUNTS)).not.toContain('stance');
  });

  it('a southpaw renders in the southpaw carriage, and it is a real flip', () => {
    expect(PORTRAIT).toContain("stance === 'southpaw'");
    expect(PORTRAIT_CSS).toMatch(/\.southpaw\s*\{[^}]*scaleX\(-1\)/);
  });

  it('marks the rendered stance on the element so a driver can assert it', () => {
    // The verify asks for "a southpaw always renders in the southpaw carriage,
    // asserted against Fighter.stance". A class alone is a CSS-module hash by
    // the time it reaches the DOM; data-stance is readable from a screenshot run.
    expect(PORTRAIT).toContain('data-stance={stance}');
  });

  it('defaults to orthodox rather than throwing on a caller that omits it', () => {
    expect(PORTRAIT).toContain("stance = 'orthodox'");
  });
});

describe('marks and wear never share a layer or a namespace (§16.4)', () => {
  const markIds = FEATURE_LAYERS.marks.map((m) => m.id);
  const wearIds = Object.values(WEAR_LAYERS).flat().map((w) => w.id);

  it('marks live in mk-* and wear in wr-*', () => {
    for (const id of markIds) expect(id.startsWith('mk-')).toBe(true);
    for (const id of wearIds) expect(id.startsWith('wr-')).toBe(true);
  });

  it('no id is defined by both dictionaries', () => {
    const overlap = markIds.filter((id) => wearIds.includes(id));
    expect(overlap).toEqual([]);
  });

  it('faceWear has no idea marks exist', () => {
    // The §15.4 contract §16.4 is protecting: wear is a pure function of the
    // fighter's history, and history says nothing about tattoos.
    // Comments stripped: wear.ts's header documents the split, which is the
    // opposite of a violation. What must not exist is code that reads them.
    const wearSource = readFileSync('src/ui/portrait/wear.ts', 'utf8')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(wearSource).not.toMatch(/\bmarks\b/);
    expect(wearSource).not.toContain('mk-');
  });

  it('renders both, in that order, so a scar crosses a tattoo and not the reverse', () => {
    const marksAt = PORTRAIT.indexOf('#mk-');
    const wearAt = PORTRAIT.indexOf('#wr-ear-');
    expect(marksAt).toBeGreaterThan(-1);
    expect(wearAt).toBeGreaterThan(-1);
    expect(marksAt).toBeLessThan(wearAt);
  });

  it('no mark path sits in the footprint wear draws into', () => {
    // features.ts documents where wear draws: brow y 27.5-31.5, swelling around
    // x 39 y 33-38, cauliflower ear at x 14-19.6 / 44.4-49.6, nose break at
    // x 33-34.5 y 36-41. A mark inside one of those boxes would collide on a
    // heavily-worn face even though the namespaces are clean.
    const FORBIDDEN: [number, number, number, number][] = [
      [22, 27, 42, 32], // brow line
      [33, 33, 45, 39], // swelling around the eye
      [33, 36, 35, 41], // nose break
    ];
    for (const mark of FEATURE_LAYERS.marks) {
      if (!mark.d) continue;
      // Only absolute M commands carry true coordinates; relative segments are
      // deltas, so subpath start points are what this can honestly check.
      for (const match of mark.d.matchAll(/M(-?[\d.]+)\s+(-?[\d.]+)/g)) {
        const x = Number(match[1]);
        const y = Number(match[2]);
        for (const [x0, y0, x1, y1] of FORBIDDEN) {
          const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
          expect(inside, `${mark.id} starts at ${x},${y}, inside a wear footprint`).toBe(false);
        }
      }
    }
  });
});

describe('the new artwork is complete and drawable', () => {
  it('every build variant carries geometry — a missing shoulder line is a floating head', () => {
    expect(FEATURE_LAYERS.build).toHaveLength(5);
    for (const build of FEATURE_LAYERS.build) expect(build.d.length).toBeGreaterThan(0);
  });

  it('marks and gear each reserve index 0 for "none"', () => {
    expect(FEATURE_LAYERS.marks[0].d).toBe('');
    expect(FEATURE_LAYERS.gear[0].d).toBe('');
  });

  it('every gear path is a closed shape, because the slot is filled', () => {
    // An open path under the fill treatment renders as a filled sliver.
    for (const gear of FEATURE_LAYERS.gear) {
      if (!gear.d) continue;
      expect(gear.d.trimEnd().endsWith('z'), `${gear.id} is not closed`).toBe(true);
    }
  });

  it('every id the code can reference is defined exactly once', () => {
    const ids = Object.values(FEATURE_LAYERS).flat().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);

    // And the ids Portrait builds by hand resolve: `#mk-${n.toString(36)}` has
    // to line up with the dictionary's own naming for all twelve marks.
    for (let i = 1; i < SLOT_COUNTS.marks; i++) {
      expect(ids).toContain(`mk-${i.toString(36)}`);
    }
    for (let i = 1; i < SLOT_COUNTS.gear; i++) {
      expect(ids).toContain(`gr-${i}`);
    }
    for (let i = 0; i < SLOT_COUNTS.build; i++) {
      expect(ids).toContain(`build-${i}`);
    }
  });

  it('generates visibly varied faces — 24 seeds, no two identical', () => {
    const grid = Array.from({ length: 24 }, (_, i) => serializeFaceCode(faceFromSeed(mulberry32(1000 + i))));
    expect(new Set(grid).size).toBe(24);
    // And the new slots are actually being exercised, not left at zero.
    const codes = grid.map(parseFaceCode);
    for (const slot of ['build', 'marks', 'gear'] as (keyof FaceCode)[]) {
      expect(new Set(codes.map((c) => c[slot])).size, `${slot} never varies`).toBeGreaterThan(1);
    }
  });
});
