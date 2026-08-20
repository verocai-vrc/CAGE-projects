// Loop 7.10 — the narration contract (DESIGN.md §16.6, §16.9).
//
// This loop writes the shape, not the content: "the shape of a line pool exists
// and is provably validated, before a single line is written." So these tests
// are about the schema, the loader, and the two structural rules that the pools
// of 7.13/7.14 will be authored against — not about prose.
//
// §16.6 requires the "validated at boot" bend be covered: "a CI test imports and
// validates EVERY content file, including the narration pools, so malformed
// content cannot ship at all." That test is here.

import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { NarrationLineSchema, NarrationPoolSchema, PredicateSchema } from '../src/state/schema';
import {
  BEAT_KINDS,
  OPTIONAL_SLOT_TAGS,
  SLOT_NAMES,
  slotsIn,
  type BeatKind,
  type NarrationLine,
} from '../src/narration/types';
import { loadNarration, resetNarrationCache, NarrationLoadError } from '../src/narration/load';

const NARRATION_DIR = join(process.cwd(), 'src', 'content', 'narration');

/** A minimal valid line, for perturbing one field at a time. */
function validLine(over: Partial<NarrationLine> = {}): Record<string, unknown> {
  return { id: 'x-1', on: 'exchange', voice: 'pbp', text: '{A} lands.', ...over };
}

describe('the line schema (§16.6)', () => {
  it('accepts a minimal line', () => {
    expect(NarrationLineSchema.safeParse(validLine()).success).toBe(true);
  });

  it('accepts every documented field', () => {
    const full = validLine({
      when: { totalDamage: { gte: 4 }, side: { eq: 'a' } },
      tags: ['loud', 'needsNickname'],
      weight: 2.5,
      priority: 2,
      cooldown: 'fight',
    });
    expect(NarrationLineSchema.safeParse(full).success).toBe(true);
  });

  it('requires id, on, voice, and text', () => {
    for (const field of ['id', 'on', 'voice', 'text']) {
      const line = validLine();
      delete line[field];
      expect(NarrationLineSchema.safeParse(line).success, `missing '${field}' was accepted`).toBe(false);
    }
  });

  it('rejects an unknown beat kind', () => {
    expect(NarrationLineSchema.safeParse(validLine({ on: 'clinch' as BeatKind })).success).toBe(false);
  });

  it('rejects an unknown voice and an unknown cooldown class', () => {
    expect(NarrationLineSchema.safeParse(validLine({ voice: 'narrator' as never })).success).toBe(false);
    expect(NarrationLineSchema.safeParse(validLine({ cooldown: 'forever' as never })).success).toBe(false);
  });

  it('rejects an unknown key', () => {
    // .strict() matters: a typo'd key in a 260-line pool is otherwise invisible.
    // The line would load, never match, and read as a content gap, not a bug.
    expect(NarrationLineSchema.safeParse({ ...validLine(), txt: 'oops' }).success).toBe(false);
  });

  it('rejects empty strings and non-positive weights', () => {
    expect(NarrationLineSchema.safeParse(validLine({ id: '' })).success).toBe(false);
    expect(NarrationLineSchema.safeParse(validLine({ text: '' })).success).toBe(false);
    expect(NarrationLineSchema.safeParse(validLine({ weight: 0 })).success).toBe(false);
    expect(NarrationLineSchema.safeParse(validLine({ weight: -1 })).success).toBe(false);
    expect(NarrationLineSchema.safeParse(validLine({ priority: -1 })).success).toBe(false);
  });

  it('covers all thirteen beat kinds and nothing else', () => {
    expect(BEAT_KINDS).toHaveLength(13);
    for (const kind of BEAT_KINDS) {
      expect(NarrationLineSchema.safeParse(validLine({ on: kind })).success, kind).toBe(true);
    }
    // §16.6a: checks fold into the kinds above, so there is deliberately no
    // 'check' kind. If one is ever added, this is where the decision surfaces.
    expect(NarrationLineSchema.safeParse(validLine({ on: 'check' as BeatKind })).success).toBe(false);
  });
});

describe('predicates are structured data, never code (§16.6)', () => {
  it('accepts each comparison form', () => {
    const forms = [
      { eq: 'a' }, { eq: 3 }, { eq: true }, { ne: 'b' },
      { gt: 1 }, { gte: 1 }, { lt: 1 }, { lte: 1 }, { in: ['a', 'b'] }, { in: [1, 2] },
    ];
    for (const clause of forms) {
      expect(PredicateSchema.safeParse({ fact: clause }).success, JSON.stringify(clause)).toBe(true);
    }
  });

  it('rejects a clause with two comparisons, or none', () => {
    // Ambiguous by construction — is it AND, or does one silently win?
    expect(PredicateSchema.safeParse({ fact: { gte: 1, lte: 5 } }).success).toBe(false);
    expect(PredicateSchema.safeParse({ fact: {} }).success).toBe(false);
  });

  it('rejects anything that could smuggle in behaviour', () => {
    expect(PredicateSchema.safeParse({ fact: { expr: 'damage > 3' } }).success).toBe(false);
    expect(PredicateSchema.safeParse({ fact: 'damage > 3' }).success).toBe(false);
    expect(PredicateSchema.safeParse({ fact: { gt: '3' } }).success).toBe(false);
    expect(PredicateSchema.safeParse({ fact: { in: [] } }).success).toBe(false);
  });
});

describe('slots (§16.6)', () => {
  it('extracts every slot in a template', () => {
    expect(slotsIn('{A} out of {GYM_A}, {N}. Across from him, {B}.')).toEqual(['A', 'GYM_A', 'N', 'B']);
    expect(slotsIn('no slots here')).toEqual([]);
  });

  it('maps each optional slot to the tag that guards it', () => {
    // "A fighter without a nickname must never render {NICK_A}" — the selector
    // filters on the tag, never a fallback string, which is how
    // "Riko 'undefined' Tanaka" reaches a screenshot.
    expect(OPTIONAL_SLOT_TAGS.NICK_A).toBe('needsNickname');
    expect(OPTIONAL_SLOT_TAGS.GYM_B).toBe('needsGym');
    for (const slot of Object.keys(OPTIONAL_SLOT_TAGS)) {
      expect(SLOT_NAMES).toContain(slot);
    }
  });
});

describe('the shipped pools', () => {
  beforeEach(resetNarrationCache);

  it('every narration content file is valid — the CI check §16.6 requires', () => {
    // §16.6 bends §2's "validated at boot" rule for the lazy chunk, and requires
    // this test as the mitigation: malformed narration content cannot ship at
    // all, so the runtime validation is a shipping-integrity check rather than
    // the only line of defence.
    const files = readdirSync(NARRATION_DIR).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(NARRATION_DIR, file), 'utf-8'));
      const parsed = NarrationPoolSchema.safeParse(raw);
      expect(parsed.success, `${file}: ${parsed.success ? '' : parsed.error.message}`).toBe(true);
    }
  });

  it('loads, validates, and freezes', async () => {
    const lines = await loadNarration();
    expect(lines.length).toBeGreaterThan(0);
    expect(Object.isFrozen(lines)).toBe(true);
  });

  it('caches for the session — a second load returns the same frozen array', async () => {
    const first = await loadNarration();
    expect(await loadNarration()).toBe(first);
  });

  it('every line id is unique across every pool', async () => {
    // Ids key the cooldown and the anti-repeat window. Two lines sharing one
    // would suppress each other and read as a thin pool, not as a bug.
    const lines = await loadNarration();
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
  });

  it('every slot used is a slot that exists', async () => {
    const lines = await loadNarration();
    for (const line of lines) {
      for (const slot of slotsIn(line.text)) {
        expect(SLOT_NAMES, `line '${line.id}' uses unknown slot {${slot}}`).toContain(slot);
      }
    }
  });

  it('every line using an optional slot carries its tag', async () => {
    const lines = await loadNarration();
    for (const line of lines) {
      for (const slot of slotsIn(line.text)) {
        const required = OPTIONAL_SLOT_TAGS[slot];
        if (!required) continue;
        expect(line.tags ?? [], `line '${line.id}' uses {${slot}} without '${required}'`).toContain(required);
      }
    }
  });

  it('every beat kind has an unconditional fallback line (§16.6)', async () => {
    // THE floor that makes the selector total. §16.6: "Every beat kind must
    // carry at least one line with cooldown: 'none' and no `when`" — that is
    // what makes the relaxation chain terminate rather than returning nothing
    // mid-bout. 7.13/7.14 add the real pools on top of this floor.
    const lines = await loadNarration();
    for (const kind of BEAT_KINDS) {
      const floor = lines.filter((l) => l.on === kind && l.cooldown === 'none' && l.when === undefined);
      expect(floor.length, `beat kind '${kind}' has no unconditional fallback line`).toBeGreaterThan(0);
    }
  });
});

describe('a malformed pool fails validation, not the runtime (§16.6)', () => {
  it('rejects a pool whose lines are malformed', () => {
    expect(NarrationPoolSchema.safeParse({ lines: [{ id: 'x' }] }).success).toBe(false);
    expect(NarrationPoolSchema.safeParse({ lines: [] }).success).toBe(false);
    expect(NarrationPoolSchema.safeParse({}).success).toBe(false);
  });

  it('NarrationLoadError names the file it came from', () => {
    // The failure path is "commentary off, tape on" — degraded, never a crash.
    // Which file broke has to survive into the message or the degradation is
    // undiagnosable.
    const error = new NarrationLoadError('bad', 'content/narration/exchange.json');
    expect(error.file).toBe('content/narration/exchange.json');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('the narration chunk stays out of the initial bundle (§16.9)', () => {
  it('content/index.ts does not import any narration pool', () => {
    // §16.9's arithmetic: M7 content is ~12KB gzip against ~10KB of headroom.
    // The split is the whole reason the initial budget still fits, so a static
    // import added to the boot-time content barrel would silently blow it. The
    // budget script would catch the size, but this catches the cause.
    const barrel = readFileSync(join(process.cwd(), 'src', 'content', 'index.ts'), 'utf-8');
    expect(barrel).not.toMatch(/narration/);
  });

  it('the narration barrel does not re-export the loader', () => {
    // Importing load.ts pulls the pool glob with it. A barrel that dragged the
    // chunk into the initial bundle would defeat the split.
    const barrel = readFileSync(join(process.cwd(), 'src', 'narration', 'index.ts'), 'utf-8');
    expect(barrel).not.toMatch(/export \* from '\.\/load'/);
  });
});
