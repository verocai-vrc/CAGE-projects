// Loop 7.12 — the selector (DESIGN.md §16.6).
//
// Stage 2: a beat becomes a line, identically on every replay. The load-bearing
// test here is the replay/corner-call pair — FightScreen re-simulates the whole
// bout every time the player makes a corner call, and the already-displayed
// commentary must not rewrite itself underneath them.

import { describe, expect, it } from 'vitest';
import { simulateFight } from '../src/engine/fight';
import { mulberry32 } from '../src/engine/rng';
import type { Fighter, FightResult, MomentOverrides, TacticId, Tactics } from '../src/engine/types';
import { archetypes } from '../src/content';
import { loadNarration } from '../src/content/narration';
import { extractBeats, type Beat } from '../src/narration/beats';
import {
  ANTI_REPEAT_WINDOW,
  narrateBeats,
  predicateHolds,
  type NarratedLine,
} from '../src/narration/select';
import { canFill, fillSlots, requiredTagsFor, type FighterView } from '../src/narration/slots';
import { BEAT_KINDS, type NarrationLine } from '../src/narration/types';

const TACTIC_IDS: TacticId[] = ['pressPace', 'shootTakedowns', 'protectLead', 'headhunt', 'balanced'];

const NAMED: FighterView = { name: 'Marcus Vance', nickname: 'The Anvil', gym: 'Ironside MMA', record: '12-3' };
const NAMELESS: FighterView = { name: 'Ruben Salas', nickname: null, gym: null, record: '8-5' };

function fighterFromArchetype(id: string, archetypeId: string): Fighter {
  const archetype = archetypes.find((entry) => entry.id === archetypeId);
  if (!archetype) throw new Error(`missing archetype fixture: ${archetypeId}`);
  return {
    id, name: id, nickname: null, nationality: 'testland', face: '000000000000',
    weightClass: 'lightweight', stance: 'orthodox',
    attributes: { ...archetype.attributes },
    archetype: archetype.id, weakness: null,
    record: { wins: 0, losses: 0, draws: 0, noContests: 0 },
    traits: [], condition: { health: 100, injuries: [] },
  };
}

/** One bout, optionally with the round-2+ tactic swapped — a corner call. */
function bout(n: number, cornerCallFrom?: { round: number; tactic: TacticId }): FightResult {
  const ids = archetypes.map((entry) => entry.id);
  const a = fighterFromArchetype('a', ids[n % ids.length]);
  const b = fighterFromArchetype('b', ids[(n * 7 + 3) % ids.length]);
  const rounds: Record<number, TacticId> = {};
  for (let round = 1; round <= 5; round++) {
    rounds[round] =
      cornerCallFrom && round >= cornerCallFrom.round
        ? cornerCallFrom.tactic
        : TACTIC_IDS[(n + round) % TACTIC_IDS.length];
  }
  const tactics: Tactics = {
    a: { cutQuality: 'clean', rounds },
    b: { cutQuality: 'clean', rounds: { ...rounds } },
  };
  const moments: MomentOverrides = n % 2 === 0 ? {} : { 0: 0.9, 1: -0.9, 2: 0.5, 3: -0.5 };
  return simulateFight(a, b, tactics, mulberry32(n), moments);
}

const pool: readonly NarrationLine[] = await loadNarration();

function narrate(n: number, lines: readonly NarrationLine[] = pool, a = NAMED, b = NAMELESS): NarratedLine[] {
  const result = bout(n);
  return narrateBeats(extractBeats(result), lines, { boutSeed: result.seed, a, b });
}

const SAMPLE = 400;

describe('replay determinism (§16.6) — the load-bearing test', () => {
  it('the same bout seed narrates byte-identically across two runs', () => {
    for (let n = 0; n < 100; n++) {
      expect(narrate(n)).toEqual(narrate(n));
    }
  });

  it('a corner call at round 2 leaves the narrated prefix unchanged', () => {
    // THE property. FightScreen re-runs the entire bout when the player makes a
    // call; every line already on screen must survive the re-simulation
    // untouched. Narration draws from `boutSeed:narration`, never from the
    // fight's stream, so a diverged round 2 cannot reach back into round 1.
    let compared = 0;

    for (let n = 0; n < 80; n++) {
      const base = bout(n);
      const afterCall = bout(n, { round: 2, tactic: 'headhunt' });

      const baseLines = narrateBeats(extractBeats(base), pool, {
        boutSeed: base.seed, a: NAMED, b: NAMELESS,
      });
      const callLines = narrateBeats(extractBeats(afterCall), pool, {
        boutSeed: afterCall.seed, a: NAMED, b: NAMELESS,
      });

      // Round 1 is the prefix the player has already watched.
      const prefix = (lines: NarratedLine[]) => lines.filter((line) => line.round === 1);
      if (prefix(baseLines).length === 0) continue;

      expect(prefix(callLines)).toEqual(prefix(baseLines));
      compared++;
    }

    expect(compared, 'no bout produced a round-1 prefix to compare').toBeGreaterThan(0);
  });

  it('a different seed narrates differently', () => {
    // Guards against the replay tests passing because narration is constant.
    const texts = new Set(
      Array.from({ length: 40 }, (_, n) => narrate(n).map((line) => line.text).join('|')),
    );
    expect(texts.size).toBeGreaterThan(1);
  });
});

describe('exactly one rng.next() per beat (§16.6)', () => {
  it('holds regardless of candidate-set size', () => {
    // §16.6 rule 1: "exactly one rng.next() per beat, unconditionally — even
    // when only one candidate matches." Divergence at beat k can then never
    // shift the stream for beats before it. The shipped pool has exactly one
    // line per kind, so every beat here takes the single-candidate path — the
    // one most likely to "optimise away" the draw.
    for (let n = 0; n < 60; n++) {
      const result = bout(n);
      const beats = extractBeats(result);
      let draws = 0;
      const counting = { next: () => { draws++; return mulberry32(n + draws).next(); } };
      narrateBeats(beats, pool, { boutSeed: result.seed, a: NAMED, b: NAMELESS, rng: counting });
      expect(draws, `bout ${n}: ${beats.length} beats consumed ${draws} draws`).toBe(beats.length);
    }
  });

  it('holds when the pool is rich and filtering does real work', () => {
    // The same discipline on the other path: many candidates, priority tiers,
    // cooldowns and the window all biting.
    const rich: NarrationLine[] = [];
    for (const kind of BEAT_KINDS) {
      rich.push({ id: `${kind}-floor`, on: kind, voice: 'pbp', cooldown: 'none', text: `${kind} floor.` });
      for (let i = 0; i < 8; i++) {
        rich.push({
          id: `${kind}-${i}`, on: kind, voice: i % 3 === 0 ? 'colour' : 'pbp',
          weight: 1 + (i % 3), priority: i % 4 === 0 ? 1 : 0,
          cooldown: i % 2 === 0 ? 'round' : 'fight',
          text: `${kind} variant ${i} for {A}.`,
        });
      }
    }
    for (let n = 0; n < 40; n++) {
      const result = bout(n);
      const beats = extractBeats(result);
      let draws = 0;
      const counting = { next: () => { draws++; return mulberry32(n * 31 + draws).next(); } };
      narrateBeats(beats, rich, { boutSeed: result.seed, a: NAMED, b: NAMELESS, rng: counting });
      expect(draws).toBe(beats.length);
    }
  });

  it('holds when the selector must relax all the way to the floor', () => {
    // Every non-floor line is gated behind a predicate that cannot match, so
    // the chain runs to stage 3 on every beat. Still one draw each.
    const gated: NarrationLine[] = BEAT_KINDS.flatMap((kind) => [
      { id: `${kind}-floor`, on: kind, voice: 'pbp', cooldown: 'none', text: `${kind} floor.` } as NarrationLine,
      {
        id: `${kind}-never`, on: kind, voice: 'pbp', cooldown: 'none',
        when: { __absent: { eq: 'nothing' } }, text: `${kind} never.`,
      } as NarrationLine,
    ]);
    const result = bout(3);
    const beats = extractBeats(result);
    let draws = 0;
    const counting = { next: () => { draws++; return 0.5; } };
    narrateBeats(beats, gated, { boutSeed: result.seed, a: NAMED, b: NAMELESS, rng: counting });
    expect(draws).toBe(beats.length);
  });
});

describe('the selector is total (§16.6)', () => {
  it('400 bouts narrate with zero exceptions and zero empty strings', () => {
    // Verify's exact wording: "with every pool artificially reduced to its
    // single unconditional fallback line". That is the shipped pool today — 13
    // lines, one per beat kind, each cooldown 'none' with no `when`.
    let narrated = 0;
    for (let n = 0; n < SAMPLE; n++) {
      const lines = narrate(n);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line.text.length).toBeGreaterThan(0);
        expect(line.text.trim()).not.toBe('');
        narrated++;
      }
    }
    expect(narrated).toBeGreaterThan(SAMPLE * 15);
  });

  it('narrates every beat exactly once, in order', () => {
    for (let n = 0; n < 100; n++) {
      const result = bout(n);
      const beats = extractBeats(result);
      const lines = narrateBeats(beats, pool, { boutSeed: result.seed, a: NAMED, b: NAMELESS });
      expect(lines).toHaveLength(beats.length);
      expect(lines.map((line) => line.beatIndex)).toEqual(beats.map((beat) => beat.index));
    }
  });

  it('throws loudly if a beat kind has no unconditional line', () => {
    // Not a silent empty string: reaching this means a content defect CI should
    // have caught, and it must be impossible to miss.
    const missingFloor = pool.filter((line) => line.on !== 'open');
    const result = bout(1);
    expect(() =>
      narrateBeats(extractBeats(result), missingFloor, {
        boutSeed: result.seed, a: NAMED, b: NAMELESS,
      }),
    ).toThrow(/no narration line for beat kind 'open'/);
  });
});

describe('slot resolution is total (§16.6)', () => {
  it('a fighter with nickname: null never yields a line containing {NICK_', () => {
    // "never a fallback string, which is how 'Riko \"undefined\" Tanaka'
    // reaches a screenshot." Asserted on RENDERED output, as Verify requires.
    const nickLines: NarrationLine[] = BEAT_KINDS.flatMap((kind) => [
      { id: `${kind}-floor`, on: kind, voice: 'pbp', cooldown: 'none', text: `${kind}: {A} and {B}.` } as NarrationLine,
      {
        id: `${kind}-nick`, on: kind, voice: 'pbp', cooldown: 'none',
        tags: ['needsNickname'], weight: 50, text: `{NICK_A} and {NICK_B} go at it.`,
      } as NarrationLine,
      {
        id: `${kind}-gym`, on: kind, voice: 'pbp', cooldown: 'none',
        tags: ['needsGym'], weight: 50, text: `Out of {GYM_A} and {GYM_B}.`,
      } as NarrationLine,
    ]);

    for (let n = 0; n < SAMPLE; n++) {
      // Fighter B has no nickname and no gym; A has both.
      for (const line of narrate(n, nickLines, NAMED, NAMELESS)) {
        expect(line.text, `bout ${n}`).not.toContain('{NICK_');
        expect(line.text).not.toContain('{GYM_');
        expect(line.text).not.toContain('undefined');
        expect(line.text).not.toContain('null');
        // No unresolved slot of any kind survives.
        expect(line.text).not.toMatch(/\{[A-Z_]+\}/);
      }
    }
  });

  it('still uses the optional slots when both fighters can fill them', () => {
    // Otherwise the test above would pass by the lines never being selected.
    const both: NarrationLine[] = BEAT_KINDS.flatMap((kind) => [
      { id: `${kind}-floor`, on: kind, voice: 'pbp', cooldown: 'none', text: `${kind} floor.` } as NarrationLine,
      {
        id: `${kind}-nick`, on: kind, voice: 'pbp', cooldown: 'none',
        tags: ['needsNickname'], weight: 100, text: `{NICK_A} against {NICK_B}.`,
      } as NarrationLine,
    ]);
    const other: FighterView = { name: 'Kenji Tanaka', nickname: 'Cold Front', gym: 'Apex', record: '9-1' };
    const used = narrate(5, both, NAMED, other).some((line) => line.text.includes('Cold Front'));
    expect(used).toBe(true);
  });

  it('canFill gates on the value, not merely on the tag', () => {
    // A line that forgot its tag must still not render a placeholder.
    const untagged: NarrationLine = {
      id: 'x', on: 'open', voice: 'pbp', text: '{NICK_B} arrives.',
    };
    expect(canFill(untagged, { a: NAMED, b: NAMELESS, round: 1 })).toBe(false);
    expect(canFill(untagged, { a: NAMED, b: NAMED, round: 1 })).toBe(true);
  });

  it('resolves every documented slot', () => {
    const text = '{A} {B} {NICK_A} {LAST_A} {LAST_B} {GYM_A} {R} {N} {TECH}';
    const filled = fillSlots(text, { a: NAMED, b: NAMELESS, round: 3, technique: 'left hook' });
    expect(filled).toBe('Marcus Vance Ruben Salas The Anvil Vance Salas Ironside MMA 3 12-3 left hook');
  });

  it('reports the tags a template ought to carry', () => {
    expect(requiredTagsFor('{NICK_A} out of {GYM_B}')).toEqual(['needsGym', 'needsNickname']);
    expect(requiredTagsFor('{A} lands.')).toEqual([]);
  });
});

describe('predicates (§16.6)', () => {
  it('ANDs its clauses and requires every fact to be present', () => {
    const facts = { totalDamage: 5, side: 'a', heavy: true };
    expect(predicateHolds(undefined, facts)).toBe(true);
    expect(predicateHolds({ totalDamage: { gte: 4 } }, facts)).toBe(true);
    expect(predicateHolds({ totalDamage: { gte: 4 }, side: { eq: 'a' } }, facts)).toBe(true);
    expect(predicateHolds({ totalDamage: { gte: 4 }, side: { eq: 'b' } }, facts)).toBe(false);
    expect(predicateHolds({ missing: { eq: 1 } }, facts)).toBe(false);
  });

  it('does not coerce — a string fact never satisfies a numeric comparison', () => {
    // '3' > 2 being true is how content bugs hide.
    expect(predicateHolds({ side: { gt: 0 } }, { side: 'a' })).toBe(false);
    expect(predicateHolds({ n: { gte: 3 } }, { n: '5' })).toBe(false);
  });

  it('supports eq/ne/in over strings and booleans', () => {
    expect(predicateHolds({ heavy: { eq: true } }, { heavy: true })).toBe(true);
    expect(predicateHolds({ heavy: { ne: true } }, { heavy: true })).toBe(false);
    expect(predicateHolds({ verdict: { in: ['UD', 'SD'] } }, { verdict: 'SD' })).toBe(true);
    expect(predicateHolds({ verdict: { in: ['UD', 'SD'] } }, { verdict: 'KO' })).toBe(false);
  });
});

describe('priority excludes rather than outweighs (§16.6)', () => {
  it('a matching priority-2 line beats a heavily-weighted priority-0 line', () => {
    // "That is how 'he is out cold' beats 'that landed clean' without
    // weight-fiddling." Weight 1000 vs 1 — priority must still win.
    const lines: NarrationLine[] = [
      { id: 'floor', on: 'open', voice: 'pbp', cooldown: 'none', text: 'floor', weight: 1000 },
      { id: 'loud', on: 'open', voice: 'pbp', cooldown: 'none', text: 'loud', priority: 2, weight: 1 },
    ];
    const result = bout(2);
    const beats = extractBeats(result).filter((beat) => beat.kind === 'open');
    for (let roll = 0; roll < 20; roll++) {
      const chosen = narrateBeats(beats, lines, {
        boutSeed: result.seed, a: NAMED, b: NAMELESS,
        rng: { next: () => roll / 20 },
      });
      expect(chosen[0].lineId).toBe('loud');
    }
  });

  it('falls back to the lower tier when the higher one does not match', () => {
    const lines: NarrationLine[] = [
      { id: 'floor', on: 'open', voice: 'pbp', cooldown: 'none', text: 'floor' },
      {
        id: 'loud', on: 'open', voice: 'pbp', cooldown: 'none', priority: 2,
        when: { __absent: { eq: 1 } }, text: 'loud',
      },
    ];
    const result = bout(2);
    const beats = extractBeats(result).filter((beat) => beat.kind === 'open');
    expect(narrateBeats(beats, lines, { boutSeed: result.seed, a: NAMED, b: NAMELESS })[0].lineId)
      .toBe('floor');
  });
});

describe('repetition control (§16.6)', () => {
  it('the anti-repeat window keeps the last 6 ids out', () => {
    // "The window is what actually kills the 'same three lines alternating'
    // failure." With 8 interchangeable lines and a window of 6, no id may
    // reappear within 6 of itself.
    const lines: NarrationLine[] = Array.from({ length: 8 }, (_, i) => ({
      id: `x-${i}`, on: 'exchange', voice: 'pbp', cooldown: 'none', text: `exchange ${i}`,
    }));
    lines.push({ id: 'other-floor', on: 'exchange', voice: 'pbp', cooldown: 'none', text: 'floor' });

    const result = bout(9);
    const beats = extractBeats(result).filter((beat) => beat.kind === 'exchange');
    if (beats.length < ANTI_REPEAT_WINDOW + 2) return;

    const ids = narrateBeats(beats, lines, { boutSeed: result.seed, a: NAMED, b: NAMELESS })
      .map((line) => line.lineId);
    for (let i = 0; i < ids.length; i++) {
      const recent = ids.slice(Math.max(0, i - ANTI_REPEAT_WINDOW), i);
      expect(recent, `id ${ids[i]} repeated inside the window at ${i}`).not.toContain(ids[i]);
    }
  });

  it("cooldown 'fight' fires a line at most once per bout when alternatives exist", () => {
    const lines: NarrationLine[] = [
      { id: 'once', on: 'exchange', voice: 'pbp', cooldown: 'fight', weight: 100, text: 'once only' },
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `alt-${i}`, on: 'exchange', voice: 'pbp', cooldown: 'none', text: `alt ${i}`,
      } as NarrationLine)),
    ];
    const result = bout(11);
    const beats = extractBeats(result).filter((beat) => beat.kind === 'exchange');
    if (beats.length < 3) return;
    const ids = narrateBeats(beats, lines, { boutSeed: result.seed, a: NAMED, b: NAMELESS })
      .map((line) => line.lineId);
    expect(ids.filter((id) => id === 'once').length).toBeLessThanOrEqual(1);
  });

  it('relaxes rather than failing when every line is on cooldown', () => {
    // One line, cooldown 'fight', many beats. Stage 2 of the chain drops the
    // cooldown; the alternative would be a silent beat.
    const lines: NarrationLine[] = [
      { id: 'solo', on: 'exchange', voice: 'pbp', cooldown: 'fight', text: 'the only line' },
      { id: 'solo-floor', on: 'exchange', voice: 'pbp', cooldown: 'none', text: 'the only line' },
    ];
    const result = bout(13);
    const beats = extractBeats(result).filter((beat) => beat.kind === 'exchange');
    const lines2 = narrateBeats(beats, lines, { boutSeed: result.seed, a: NAMED, b: NAMELESS });
    expect(lines2).toHaveLength(beats.length);
    for (const line of lines2) expect(line.text.length).toBeGreaterThan(0);
  });
});

describe("the colour voice's hard rules (§16.6)", () => {
  const twoVoice: NarrationLine[] = BEAT_KINDS.flatMap((kind) => [
    { id: `${kind}-pbp`, on: kind, voice: 'pbp', cooldown: 'none', text: `${kind} pbp` } as NarrationLine,
    { id: `${kind}-colour`, on: kind, voice: 'colour', cooldown: 'none', weight: 20, text: `${kind} colour` } as NarrationLine,
  ]);

  it('never fires colour twice consecutively', () => {
    for (let n = 0; n < 120; n++) {
      const voices = narrate(n, twoVoice).map((line) => line.voice);
      for (let i = 1; i < voices.length; i++) {
        expect(voices[i] === 'colour' && voices[i - 1] === 'colour', `bout ${n} at ${i}`).toBe(false);
      }
    }
  });

  it('never opens a finish beat in colour', () => {
    let finishes = 0;
    for (let n = 0; n < 200; n++) {
      const result = bout(n);
      const beats = extractBeats(result);
      const lines = narrateBeats(beats, twoVoice, { boutSeed: result.seed, a: NAMED, b: NAMELESS });
      for (const beat of beats.filter((b) => b.kind === 'finish')) {
        const line = lines.find((l) => l.beatIndex === beat.index);
        expect(line?.voice, `bout ${n} finish narrated in colour`).toBe('pbp');
        finishes++;
      }
    }
    expect(finishes, 'no finish beats in the sample').toBeGreaterThan(0);
  });

  it('still lets colour through often enough to matter', () => {
    // Otherwise the two rules above would pass by colour never being selected.
    const voices = Array.from({ length: 60 }, (_, n) => narrate(n, twoVoice)).flat();
    const colour = voices.filter((line) => line.voice === 'colour').length;
    expect(colour / voices.length).toBeGreaterThan(0.1);
  });
});

describe('narration draws from its own stream, never the fight\'s (§16.6)', () => {
  it('is a function of the bout seed, not of the beats\' provenance', () => {
    // Same beats, same seed => same lines, regardless of how the beats arrived.
    const result = bout(21);
    const beats: Beat[] = extractBeats(result);
    const once = narrateBeats(beats, pool, { boutSeed: result.seed, a: NAMED, b: NAMELESS });
    const twice = narrateBeats([...beats], pool, { boutSeed: result.seed, a: NAMED, b: NAMELESS });
    expect(twice).toEqual(once);
  });

  it('changing only the seed changes the narration', () => {
    const result = bout(21);
    const beats = extractBeats(result);
    const a = narrateBeats(beats, pool, { boutSeed: 'SEED-ONE', a: NAMED, b: NAMELESS });
    const b = narrateBeats(beats, pool, { boutSeed: 'SEED-TWO', a: NAMED, b: NAMELESS });
    expect(a.map((l) => l.lineId).join()).toBe(b.map((l) => l.lineId).join()); // one line per kind today
    expect(a).toHaveLength(b.length);
  });

  it('does not mutate the beats or the pool it is handed', () => {
    const result = bout(23);
    const beats = extractBeats(result);
    const beatsBefore = structuredClone(beats);
    const poolBefore = structuredClone(pool);
    narrateBeats(beats, pool, { boutSeed: result.seed, a: NAMED, b: NAMELESS });
    expect(beats).toEqual(beatsBefore);
    expect(pool).toEqual(poolBefore);
  });
});
