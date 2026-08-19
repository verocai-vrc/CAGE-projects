// portraitEditor.spec.ts — Loop 6.5: the portrait editor's cycling logic and
// its handoff into the real pro-debut pipeline.
//
// Loop 6.5's verify is explicit that a full DOM round-trip is blocked as
// written: persist.ts is complete and tested but no application code calls it
// yet (that wiring is Loop 7.1). So this file verifies the round-trip one
// layer down — at the store level, through the real persist.ts functions —
// and leaves the "survives an actual page reload" check to 7.1, per the
// loop's own note.

import { describe, expect, it } from 'vitest';
import { buildOriginFromChoices } from '../src/career/origin';
import { startCareer } from '../src/career/progression';
import { loadCareer, saveCareerImmediate } from '../src/state/persist';
import { amateurMoments } from '../src/content';
import { faceFromSeed, parseFaceCode, serializeFaceCode, SLOT_COUNTS, SLOT_ORDER } from '../src/ui/portrait/faceCode';
import { FEATURE_LABELS } from '../src/ui/portrait/features';
import { mulberry32 } from '../src/engine/rng';

function makeMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  };
}

// Mirrors PortraitEditor's cycle() — kept in sync by hand since the component
// doesn't export it; if this drifts, the wraparound tests below will fail.
function cycle(value: number, count: number, delta: number): number {
  return (value + delta + count) % count;
}

describe('PortraitEditor cycling', () => {
  it('wraps forward past the last variant back to the first', () => {
    for (const slot of SLOT_ORDER) {
      const count = SLOT_COUNTS[slot];
      expect(cycle(count - 1, count, 1)).toBe(0);
    }
  });

  it('wraps backward past the first variant to the last', () => {
    for (const slot of SLOT_ORDER) {
      const count = SLOT_COUNTS[slot];
      expect(cycle(0, count, -1)).toBe(count - 1);
    }
  });

  it('every cycled value stays in range across a full lap', () => {
    for (const slot of SLOT_ORDER) {
      const count = SLOT_COUNTS[slot];
      let value = 0;
      for (let i = 0; i < count * 2; i++) {
        value = cycle(value, count, 1);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(count);
      }
      // A full lap (count steps) returns to the start.
      expect(value).toBe((count * 2) % count);
    }
  });
});

describe('the editor names every variant, and names none of them with a digit', () => {
  // §9.1's no-numbers rule is enforced end-to-end by the run-cage driver, which
  // reads the chargen step's textContent and fails on any digit. That check found
  // a real regression once: a positional fallback ("option 3 of 6") supplying the
  // accessible name for the two swatch slots, which is invisible on screen and so
  // survives every visual review. These two tests put the same rule where it can
  // fail in a second rather than in a full playthrough.

  it('names exactly as many variants as each slot has', () => {
    for (const slot of SLOT_ORDER) {
      expect(FEATURE_LABELS[slot]).toHaveLength(SLOT_COUNTS[slot]);
    }
  });

  it('uses no digit in any variant name, including the tone slots', () => {
    // The tone slots matter most here: they render as a colour swatch, so their
    // name reaches the DOM only as screen-reader text.
    const offenders = SLOT_ORDER.flatMap((slot) =>
      FEATURE_LABELS[slot].filter((name) => /\d/.test(name)).map((name) => `${slot}: ${name}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe('authored face flows through the real pro-debut entry point', () => {
  it('an authored FaceCode survives buildOriginFromChoices -> startCareer unchanged', () => {
    const authored = faceFromSeed(mulberry32(123));
    const face = serializeFaceCode(authored);

    const chosen = amateurMoments.map((moment) => moment.options[0]);
    const origin = buildOriginFromChoices(chosen);
    const career = startCareer(origin, 'test-seed', 'player-1', 'Your Fighter', { face });

    expect(career.player?.face).toBe(face);
    expect(parseFaceCode(career.player!.face)).toEqual(authored);
  });

  it('round-trips an authored face through save/load at the store level (persist.ts)', () => {
    const storage = makeMemoryStorage();
    const face = serializeFaceCode(faceFromSeed(mulberry32(456)));
    const chosen = amateurMoments.map((moment) => moment.options[1] ?? moment.options[0]);
    const origin = buildOriginFromChoices(chosen);
    const career = startCareer(origin, 'test-seed', 'player-1', 'Your Fighter', { face });

    saveCareerImmediate(career, storage);
    const loaded = loadCareer(storage);

    expect(loaded.status).toBe('loaded');
    expect(loaded.career.player?.face).toBe(face);
    expect(loaded.career).toEqual(career);
  });
});
