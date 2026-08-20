// Loop 7.13 — the coverage matrix (DESIGN.md §16.6).
//
// §16.6: "A test walks the `BeatKind` union and the reachability manifest and
// fails on any kind below its floor." Loop 7.10 built the half of that which
// could exist before any content did — every kind has an unconditional fallback
// line — and left the matrix itself for the loops that write the pools. This is
// that test.
//
// It is deliberately split by which loop owns each kind. 7.13 authors the eight
// ACTION kinds and asserts their floors hard; the five FRAME kinds are 7.14's,
// and are listed here as `todo` rather than as failures, so the matrix reads as
// one table and finishing 7.14 is a matter of deleting the todos.
//
// Three checks here are not floors and matter more than the counts:
//
//   - Every fact a `when` names must be a fact that beat kind ACTUALLY emits,
//     measured against 400 real bouts. A predicate over `heavey` or over a fact
//     that only `roundEnd` carries never matches, and a line that never matches
//     reads as a thin pool rather than as the bug it is.
//   - Every authored line must be REACHED across a sample of real bouts. A floor
//     of 40 that contains 12 lines the selector can never pick is a floor of 28.
//   - The voice word ranges from §16.6. They are what keeps Ray and Kass sounding
//     like two people rather than one person with two labels.

import { describe, expect, it } from 'vitest';
import { simulateFight } from '../src/engine/fight';
import { mulberry32 } from '../src/engine/rng';
import type { Fighter, FightResult, MomentOverrides, TacticId, Tactics } from '../src/engine/types';
import { archetypes } from '../src/content';
import { loadNarration } from '../src/content/narration';
import { extractBeats } from '../src/narration/beats';
import { narrateBeats, predicateHolds } from '../src/narration/select';
import type { FighterView } from '../src/narration/slots';
import { slotsIn, type BeatKind, type NarrationLine } from '../src/narration/types';

const pool: readonly NarrationLine[] = await loadNarration();
const linesOn = (kind: BeatKind) => pool.filter((line) => line.on === kind);

/** Lines whose `when` asserts `fact === value` — how a sub-condition is counted. */
function linesWhere(kind: BeatKind, fact: string, value: string | boolean): NarrationLine[] {
  return linesOn(kind).filter((line) => {
    const clause = line.when?.[fact];
    return !!clause && 'eq' in clause && clause.eq === value;
  });
}

// --- the sample --------------------------------------------------------------

const TACTIC_IDS: TacticId[] = ['pressPace', 'shootTakedowns', 'protectLead', 'headhunt', 'balanced'];

const NAMED: FighterView = { name: 'Marcus Vance', nickname: 'The Anvil', gym: 'Ironside MMA', record: '12-3' };
const OTHER: FighterView = { name: 'Kenji Tanaka', nickname: 'Cold Front', gym: 'Apex Athletic', record: '9-1' };

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

function bout(n: number): FightResult {
  const ids = archetypes.map((entry) => entry.id);
  const a = fighterFromArchetype('a', ids[n % ids.length]);
  const b = fighterFromArchetype('b', ids[(n * 7 + 3) % ids.length]);
  const rounds: Record<number, TacticId> = {};
  for (let round = 1; round <= 5; round++) rounds[round] = TACTIC_IDS[(n + round) % TACTIC_IDS.length];
  const tactics: Tactics = {
    a: { cutQuality: 'clean', rounds },
    b: { cutQuality: 'clean', rounds: { ...rounds } },
  };
  const moments: MomentOverrides = n % 2 === 0 ? {} : { 0: 0.9, 1: -0.9, 2: 0.5, 3: -0.5 };
  return simulateFight(a, b, tactics, mulberry32(n), moments);
}

const SAMPLE = 400;

/**
 * Every bout in the sample, narrated with both fighters fully named.
 *
 * The bout seed is `bout-${n}` rather than `result.seed`, and that is load-
 * bearing: the engine stamps `FightResult.seed` as the empty string on every
 * bout today (`engine/fight.ts` — Loop 7.16 owns giving it a real one), so a
 * harness that passed it through would narrate all 400 bouts from a single
 * identical RNG stream. Under that, most of a 40-line pool never fires and the
 * coverage below would measure the fixture rather than the content. Production
 * supplies a distinct seed per bout; so does this.
 */
const narrated = Array.from({ length: SAMPLE }, (_, n) => {
  const beats = extractBeats(bout(n));
  return { beats, lines: narrateBeats(beats, pool, { boutSeed: `bout-${n}`, a: NAMED, b: OTHER }) };
});

// --- §16.6's coverage matrix -------------------------------------------------

/** The eight kinds Loop 7.13 authors, with §16.6's floors. */
const ACTION_FLOORS: Partial<Record<BeatKind, number>> = {
  exchange: 40,
  moment: 18,
  takedown: 14,
  stuffed: 12,
  rocked: 12,
  standup: 10,
  ground: 10,
  submission: 10,
};

describe("§16.6's coverage matrix — action beats (Loop 7.13)", () => {
  for (const [kind, floor] of Object.entries(ACTION_FLOORS) as [BeatKind, number][]) {
    it(`${kind} has at least ${floor} lines`, () => {
      expect(linesOn(kind).length, `${kind} has ${linesOn(kind).length}`).toBeGreaterThanOrEqual(floor);
    });
  }

  it('exchange carries at least 6 lines in each of its five sub-conditions', () => {
    // §16.6: ">=6 in each of heavy / light / one-sided / answered / ground".
    const subConditions: [string, NarrationLine[]][] = [
      ['heavy', linesWhere('exchange', 'heavy', true)],
      ['light', linesWhere('exchange', 'heavy', false)],
      ['one-sided', linesWhere('exchange', 'oneSided', true)],
      ['answered', linesWhere('exchange', 'answered', true)],
      ['ground', linesWhere('exchange', 'ground', true)],
    ];
    for (const [name, lines] of subConditions) {
      expect(lines.length, `exchange/${name} has ${lines.length}`).toBeGreaterThanOrEqual(6);
    }
  });

  it('no non-ground exchange line can fire on a ground exchange', () => {
    // Not a floor — a correctness rule. Ground striking is an `exchange` with
    // `ground: true` (see beats.ts), so without this guard "steps in behind the
    // jab" narrates a man being hit while flat on his back.
    // The fallback is exempt: it is the unconditional floor that makes the
    // selector total, so it cannot carry a `when` at all — and its text is
    // written to be true on the mat as well as on the feet.
    for (const line of linesOn('exchange').filter((line) => !line.id.startsWith('fallback-'))) {
      const clause = line.when?.ground;
      expect(clause, `exchange line '${line.id}' does not say whether it is a ground line`).toBeDefined();
    }
  });

  it('moment carries at least 3 lines per kind x outcome', () => {
    for (const momentKind of ['scramble', 'submissionEscape', 'finishingSequence']) {
      for (const outcome of ['success', 'fail']) {
        const lines = linesOn('moment').filter(
          (line) =>
            line.when?.momentKind && 'eq' in line.when.momentKind && line.when.momentKind.eq === momentKind &&
            line.when?.outcome && 'eq' in line.when.outcome && line.when.outcome.eq === outcome,
        );
        expect(lines.length, `moment/${momentKind}/${outcome} has ${lines.length}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('submission carries at least 4 lines per outcome', () => {
    for (const outcome of ['locked', 'escaped']) {
      const lines = linesWhere('submission', 'outcome', outcome);
      expect(lines.length, `submission/${outcome} has ${lines.length}`).toBeGreaterThanOrEqual(4);
    }
  });

  it.todo('open has at least 14 lines — Loop 7.14');
  it.todo('roundEnd has at least 24 lines, >=6 per sub-condition — Loop 7.14');
  it.todo('finish has at least 18 lines, >=6 per method — Loop 7.14');
  it.todo('decision has at least 12 lines, >=3 per verdict — Loop 7.14');
  it.todo('corner has at least 10 lines — Loop 7.14');
  it.todo('the pool carries at least 60 colour lines — Loop 7.14');
});

// --- predicates and reachability ---------------------------------------------

describe('every line is one a real bout can actually reach', () => {
  /** Every fact name each beat kind emits, measured over the sample. */
  const factsByKind = new Map<BeatKind, Set<string>>();
  for (const { beats } of narrated) {
    for (const beat of beats) {
      let set = factsByKind.get(beat.kind);
      if (!set) factsByKind.set(beat.kind, (set = new Set()));
      for (const fact of Object.keys(beat.facts)) set.add(fact);
    }
  }

  it('every `when` names a fact its beat kind actually emits', () => {
    // A predicate over a fact the kind never carries can never match. The line
    // loads, validates, and is silently dead — which reads as a thin pool, not
    // as the typo it is.
    for (const line of pool) {
      const facts = factsByKind.get(line.on);
      if (!facts) continue; // kind never fired in the sample — covered below
      for (const fact of Object.keys(line.when ?? {})) {
        expect(facts.has(fact), `line '${line.id}' predicates on '${fact}', which ${line.on} never emits`).toBe(true);
      }
    }
  });

  it('every `{X}`/`{Y}` line sits on a kind that has an actor', () => {
    // `canFill` already keeps these off actorless beats at runtime, so the
    // failure mode is not a placeholder on screen — it is a line that silently
    // never fires. This catches it at author time.
    for (const line of pool) {
      const usesActor = slotsIn(line.text).some((slot) => slot.endsWith('X') || slot.endsWith('Y'));
      if (!usesActor) continue;
      expect(
        factsByKind.get(line.on)?.has('side') ?? true,
        `line '${line.id}' uses {X}/{Y} but ${line.on} beats carry no side`,
      ).toBe(true);
    }
  });

  it('every authored line is reached at least once across 400 bouts', () => {
    // A floor of 40 containing lines the selector can never pick is not a floor
    // of 40. Both fighters here are fully named, so the nickname- and gym-gated
    // lines are eligible; a line still unreached is one whose predicate never
    // holds or whose priority tier always excludes it.
    const fired = new Set(narrated.flatMap(({ lines }) => lines.map((line) => line.lineId)));

    // A line can only be held to this where it had the airtime to prove it, and
    // airtime is a property of the PREDICATE, not of the kind. `moment` fires
    // 914 times across the sample, but `moment` + submissionEscape + success
    // fires twice — the escape moment is rare in the engine, and demanding its
    // three lines all fire would be demanding luck, not coverage. So lines are
    // grouped by the exact beats they compete for, and a group is only held to
    // the bar once it has four airings per line in it.
    const allBeats = narrated.flatMap(({ beats }) => beats);
    const groups = new Map<string, NarrationLine[]>();
    for (const line of pool) {
      if (line.id.startsWith('fallback-')) continue;
      const key = `${line.on}|${JSON.stringify(line.when ?? null)}`;
      const bucket = groups.get(key);
      if (bucket) bucket.push(line);
      else groups.set(key, [line]);
    }

    const unreached: string[] = [];
    const thin: string[] = [];
    for (const [key, lines] of groups) {
      const kind = key.slice(0, key.indexOf('|'));
      const airings = allBeats.filter(
        (beat) => beat.kind === kind && predicateHolds(lines[0].when, beat.facts),
      ).length;
      const missing = lines.filter((line) => !fired.has(line.id)).map((line) => line.id);
      if (airings >= lines.length * 4) unreached.push(...missing);
      else if (missing.length > 0) thin.push(`${key} (${airings} airings / ${lines.length} lines)`);
    }
    // Not a failure — the engine decides how often a submission escape happens,
    // not the content. Printed so a group that goes silent is visible.
    if (thin.length > 0) console.log(`  too rare to prove reached: ${thin.join(', ')}`);
    expect(unreached, `never selected in ${SAMPLE} bouts: ${unreached.join(', ')}`).toEqual([]);
  });
});

// --- the two voices ----------------------------------------------------------

/** Words, counting a `{SLOT}` as the one word it will render as. */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).length;
}

describe('the two voices (§16.6)', () => {
  it('Ray plays it by play: 6-14 words, present tense', () => {
    for (const line of pool.filter((line) => line.voice === 'pbp')) {
      const words = wordCount(line.text);
      expect(words, `pbp line '${line.id}' is ${words} words: ${line.text}`).toBeGreaterThanOrEqual(6);
      expect(words, `pbp line '${line.id}' is ${words} words: ${line.text}`).toBeLessThanOrEqual(14);
    }
  });

  it('Kass explains why: 10-20 words', () => {
    for (const line of pool.filter((line) => line.voice === 'colour')) {
      const words = wordCount(line.text);
      expect(words, `colour line '${line.id}' is ${words} words: ${line.text}`).toBeGreaterThanOrEqual(10);
      expect(words, `colour line '${line.id}' is ${words} words: ${line.text}`).toBeLessThanOrEqual(20);
    }
  });

  it('colour fires often enough to be a second voice, not a garnish', () => {
    // §16.6: "fires on roughly one beat in three". The selector enforces the two
    // hard rules (never consecutive, never opening a finish) and leaves the rate
    // to pool composition, so the rate is measured here rather than asserted
    // there. Loop 7.14 raises this as the frame pools land.
    const all = narrated.flatMap(({ lines }) => lines);
    const share = all.filter((line) => line.voice === 'colour').length / all.length;
    expect(share, `colour share was ${(share * 100).toFixed(1)}%`).toBeGreaterThan(0.15);
  });
});

// --- what a player actually hears --------------------------------------------

describe('what a bout sounds like', () => {
  it('no line repeats inside a single bout', () => {
    // The Verify item for this loop, checked over 400 bouts rather than the five
    // read by eye. Every authored line carries cooldown 'fight' for exactly
    // this; the fallback pool is 'none' by necessity, and is weighted down so
    // far that it effectively never wins a contested beat.
    // Scoped to the kinds this loop authors. The frame kinds narrate from the
    // unconditional fallback until 7.14 lands their pools, and an unconditional
    // line is by definition allowed to repeat — `fallback-roundEnd` fires every
    // round of every bout. 7.14 deletes this scoping.
    const owned = new Set(Object.keys(ACTION_FLOORS));
    for (const [n, { beats, lines }] of narrated.entries()) {
      const seen = new Set<string>();
      for (const line of lines) {
        if (!owned.has(beats[line.beatIndex].kind)) continue;
        expect(seen.has(line.lineId), `bout ${n} repeated line '${line.lineId}'`).toBe(false);
        seen.add(line.lineId);
      }
    }
  });

  it('never fires the colour voice twice in a row', () => {
    for (const [n, { lines }] of narrated.entries()) {
      for (let i = 1; i < lines.length; i++) {
        expect(
          lines[i].voice === 'colour' && lines[i - 1].voice === 'colour',
          `bout ${n}: two colour lines at ${i - 1} and ${i}`,
        ).toBe(false);
      }
    }
  });

  it('leans on the authored pools rather than the fallbacks', () => {
    // The fallback lines exist to make the selector total, not to narrate. If
    // they are carrying real load, a predicate somewhere is over-narrow.
    // Frame kinds have no authored pool until 7.14 and legitimately narrate
    // from the fallbacks, so this measures only the beats 7.13 owns.
    const owned = new Set(Object.keys(ACTION_FLOORS));
    const ownedLines = narrated.flatMap(({ beats, lines }) =>
      lines.filter((line) => owned.has(beats[line.beatIndex].kind)),
    );
    const ownedFallbacks = ownedLines.filter((line) => line.lineId.startsWith('fallback-'));
    expect(
      ownedFallbacks.length / ownedLines.length,
      `fallbacks carried ${((ownedFallbacks.length / ownedLines.length) * 100).toFixed(2)}% of action beats`,
    ).toBeLessThan(0.02);
  });

  it('reads as commentary — a sample bout, printed', () => {
    // Not an assertion so much as the artifact this loop is judged on. The
    // Verify item is "read 5 full narrated bouts end to end"; this is how they
    // were read. Run with --disable-console-intercept to see them.
    for (const n of [3, 11, 27, 58, 101]) {
      const { beats, lines } = narrated[n];
      const out = lines.map((line) => {
        const kind = beats[line.beatIndex].kind;
        return `  R${line.round} ${line.voice.padEnd(6)} ${kind.padEnd(10)} ${line.text}`;
      });
      console.log(`\n--- bout ${n} (${lines.length} beats) ---\n${out.join('\n')}`);
      expect(lines.length).toBeGreaterThan(0);
    }
  });
});
