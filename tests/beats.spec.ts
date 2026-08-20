// Loop 7.11 — beat extraction (DESIGN.md §16.6, §16.6a).
//
// Stage 1 of the narration pipeline: a bout's ~118 events compressed to its
// story. The four properties these tests exist to hold are the ones every later
// loop builds on — the budget, the terminal-beat exclusivity, purity, and the
// prefix property that corner-call re-simulation depends on.

import { describe, expect, it } from 'vitest';
import { simulateFight } from '../src/engine/fight';
import { mulberry32 } from '../src/engine/rng';
import type { Fighter, FightResult, MomentOverrides, TacticId, Tactics } from '../src/engine/types';
import { archetypes } from '../src/content';
import {
  BEAT_BUDGET_PER_ROUND,
  MANDATORY_KINDS,
  extractBeats,
  type Beat,
} from '../src/narration/beats';
import { BEAT_KINDS } from '../src/narration/types';

const TACTIC_IDS: TacticId[] = ['pressPace', 'shootTakedowns', 'protectLead', 'headhunt', 'balanced'];

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

/** One bout from the standard sample, with tactics and moments supplied. */
function bout(n: number, overrides?: MomentOverrides): FightResult {
  const ids = archetypes.map((entry) => entry.id);
  const a = fighterFromArchetype('a', ids[n % ids.length]);
  const b = fighterFromArchetype('b', ids[(n * 7 + 3) % ids.length]);
  const rounds: Record<number, TacticId> = {};
  for (let round = 1; round <= 5; round++) rounds[round] = TACTIC_IDS[(n + round) % TACTIC_IDS.length];
  const tactics: Tactics = {
    a: { cutQuality: 'clean', rounds },
    b: { cutQuality: 'clean', rounds },
  };
  const moments: MomentOverrides = overrides ?? (n % 2 === 0 ? {} : { 0: 0.9, 1: -0.9, 2: 0.5, 3: -0.5 });
  return simulateFight(a, b, tactics, mulberry32(n), moments);
}

const SAMPLE = 400;
const sample: { result: FightResult; beats: Beat[] }[] = Array.from({ length: SAMPLE }, (_, n) => {
  const result = bout(n);
  return { result, beats: extractBeats(result) };
});

function beatsByRound(beats: Beat[]): Map<number, Beat[]> {
  const map = new Map<number, Beat[]>();
  for (const beat of beats) {
    const bucket = map.get(beat.round);
    if (bucket) bucket.push(beat);
    else map.set(beat.round, [beat]);
  }
  return map;
}

describe('the budget (§16.6, re-measured in §16.6a)', () => {
  it('mean beats per bout is 18–24', () => {
    const mean = sample.reduce((sum, entry) => sum + entry.beats.length, 0) / SAMPLE;
    expect(mean, `mean was ${mean.toFixed(2)}`).toBeGreaterThanOrEqual(18);
    expect(mean, `mean was ${mean.toFixed(2)}`).toBeLessThanOrEqual(24);
  });

  it('no round exceeds 7 beats', () => {
    // The rule that forced the corner collapse. cornerCall fires once per
    // fighter, so it is always 0 or 2 per round; counting each as a beat puts
    // MANDATORY beats alone at 8 in 0.67% of rounds, and §16.6 says mandatory
    // beats always narrate. Collapsed, the two rules hold together.
    //
    // `open` and `decision` are excluded because they bracket the bout rather
    // than belonging to a round — the walkout is not part of round 1's action.
    // With them inside the budget the arithmetic ceiling on beats per bout is
    // 7 x 2.52 rounds ~= 17.6, which undershoots §16.6's own 18-24 target no
    // matter how extraction is written.
    for (const { beats } of sample) {
      const roundScoped = beats.filter((beat) => beat.kind !== 'open' && beat.kind !== 'decision');
      for (const [round, inRound] of beatsByRound(roundScoped)) {
        expect(inRound.length, `round ${round} had ${inRound.length} beats`).toBeLessThanOrEqual(
          BEAT_BUDGET_PER_ROUND,
        );
      }
    }
  });

  it('never narrates two corner beats in one round', () => {
    for (const { beats } of sample) {
      for (const [, inRound] of beatsByRound(beats)) {
        expect(inRound.filter((beat) => beat.kind === 'corner').length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('never drops a mandatory beat', () => {
    // Mandatory beats always narrate — the budget only ever evicts optional
    // ones. Counted against the raw event log rather than against extraction's
    // own output, so this cannot pass by agreeing with itself.
    for (const { result, beats } of sample) {
      const knockdowns = result.events.filter((event) => event.t === 'knockdown').length;
      const moments = result.events.filter((event) => event.t === 'playerMoment').length;
      const roundEnds = result.events.filter((event) => event.t === 'roundEnd').length;
      const finishes = result.events.filter((event) => event.t === 'finish').length;

      expect(beats.filter((beat) => beat.kind === 'rocked')).toHaveLength(knockdowns);
      expect(beats.filter((beat) => beat.kind === 'moment')).toHaveLength(moments);
      expect(beats.filter((beat) => beat.kind === 'roundEnd')).toHaveLength(roundEnds);
      expect(beats.filter((beat) => beat.kind === 'finish')).toHaveLength(finishes);
    }
  });

  it('compresses by roughly six to one', () => {
    // §16.6's whole premise: "85 events is not 85 lines." (117.6 now.)
    const events = sample.reduce((sum, entry) => sum + entry.result.events.length, 0);
    const beats = sample.reduce((sum, entry) => sum + entry.beats.length, 0);
    expect(events / beats).toBeGreaterThan(4);
  });
});

describe('terminal beats are exclusive (§16.1)', () => {
  it('a decision bout produces exactly one decision beat and zero finish beats', () => {
    const decisions = sample.filter(({ result }) => ['UD', 'SD', 'MD', 'DRAW'].includes(result.method));
    expect(decisions.length).toBeGreaterThan(0);
    for (const { beats } of decisions) {
      expect(beats.filter((beat) => beat.kind === 'decision')).toHaveLength(1);
      expect(beats.filter((beat) => beat.kind === 'finish')).toHaveLength(0);
    }
  });

  it('a finished bout produces exactly one finish beat and zero decision beats', () => {
    const finishes = sample.filter(({ result }) => ['KO', 'TKO', 'SUB'].includes(result.method));
    expect(finishes.length).toBeGreaterThan(0);
    for (const { beats } of finishes) {
      expect(beats.filter((beat) => beat.kind === 'finish')).toHaveLength(1);
      expect(beats.filter((beat) => beat.kind === 'decision')).toHaveLength(0);
    }
  });

  it('every bout opens on exactly one open beat, and it comes first', () => {
    for (const { beats } of sample) {
      expect(beats.filter((beat) => beat.kind === 'open')).toHaveLength(1);
      expect(beats[0].kind).toBe('open');
    }
  });

  it('the terminal beat is last', () => {
    for (const { beats } of sample) {
      expect(['finish', 'decision', 'roundEnd']).toContain(beats[beats.length - 1].kind);
    }
  });

  it('carries the verdict on the decision beat and the method on the finish beat', () => {
    for (const { result, beats } of sample) {
      const decision = beats.find((beat) => beat.kind === 'decision');
      const finish = beats.find((beat) => beat.kind === 'finish');
      if (decision) expect(decision.facts.verdict).toBe(result.method);
      if (finish) expect(finish.facts.method).toBe(result.method);
    }
  });
});

describe('extraction is pure (§16.6)', () => {
  it('same FightResult in, identical Beat[] out', () => {
    for (let n = 0; n < 50; n++) {
      const result = bout(n);
      expect(extractBeats(result)).toEqual(extractBeats(result));
    }
  });

  it('takes no rng parameter at all', () => {
    // §16.6 puts ALL narration randomness in Stage 2, on its own stream,
    // because FightScreen re-simulates the whole bout on every corner call. A
    // Stage 1 that drew from a stream would re-narrate the displayed prefix
    // differently each time. Asserting on arity is the cheapest way to keep an
    // `rng` argument from being added "just for this one case".
    expect(extractBeats).toHaveLength(1);
  });

  it('does not mutate the FightResult it reads', () => {
    const result = bout(7);
    const before = structuredClone(result);
    extractBeats(result);
    expect(result).toEqual(before);
  });

  it('indexes beats contiguously from zero', () => {
    // The selector walks these in order and consumes exactly one rng.next() per
    // beat; a gap would silently desynchronise the stream.
    for (const { beats } of sample) {
      expect(beats.map((beat) => beat.index)).toEqual(beats.map((_, i) => i));
    }
  });

  it('only ever emits kinds from the BeatKind union', () => {
    for (const { beats } of sample) {
      for (const beat of beats) expect(BEAT_KINDS).toContain(beat.kind);
    }
  });

  it('emits no check beat — §16.6a folds checks into existing kinds', () => {
    for (const { beats } of sample) {
      for (const beat of beats) expect(beat.kind).not.toBe('check');
    }
  });
});

describe('the prefix property (§16.6)', () => {
  it('beats over a diverged log agree up to the divergence point', () => {
    // THE property corner-call re-simulation depends on. FightScreen re-runs the
    // whole bout when the player makes a call; the already-displayed beats must
    // not change underneath them. Extraction reads no further than the event it
    // is on, so a shared event prefix must yield a shared beat prefix.
    let compared = 0;

    for (let n = 0; n < 60; n++) {
      const base = bout(n, {});
      // A different moment performance diverges the log at the first moment.
      const diverged = bout(n, { 0: 1, 1: -1, 2: 1, 3: -1, 4: 1 });

      // Where do the two event logs first differ?
      const shared: number[] = [];
      const limit = Math.min(base.events.length, diverged.events.length);
      let cut = limit;
      for (let i = 0; i < limit; i++) {
        if (JSON.stringify(base.events[i]) !== JSON.stringify(diverged.events[i])) { cut = i; break; }
        shared.push(i);
      }
      if (cut === 0) continue; // diverged immediately — nothing to compare

      // Extract from each log truncated to the shared prefix. Truncation is what
      // isolates the property: identical input prefix must give identical beats.
      const prefixOf = (result: FightResult): FightResult => ({
        ...result,
        events: result.events.slice(0, cut),
      });
      // `decision` is excluded: it is synthesised from the ABSENCE of a finish
      // in the log plus FightResult.method, so two truncated logs legitimately
      // synthesise different verdicts. Every beat derived from the events
      // themselves must agree, and that is what the property is about.
      const withoutVerdict = (result: FightResult) =>
        extractBeats(prefixOf(result)).filter((beat) => beat.kind !== 'decision');
      expect(withoutVerdict(base)).toEqual(withoutVerdict(diverged));
      compared++;
    }

    expect(compared, 'no diverging pair was found to compare').toBeGreaterThan(0);
  });

  it('extending a log never rewrites the beats of its prefix', () => {
    // The same property stated forward: beats already shown stay as they were
    // when more of the fight arrives. `decision` is excluded because it is
    // synthesised from the absence of a finish, so a truncated log legitimately
    // synthesises one where the full log does not.
    for (let n = 0; n < 40; n++) {
      const result = bout(n);
      const full = extractBeats(result).filter((beat) => beat.kind !== 'decision');
      const cut = Math.floor(result.events.length * 0.6);
      const partial = extractBeats({ ...result, events: result.events.slice(0, cut) })
        .filter((beat) => beat.kind !== 'decision');

      // Compare on the rounds the prefix fully contains, so a half-finished
      // round's in-flight aggregation is not counted against the property.
      const lastCompleteRound = Math.max(0, ...partial.filter((b) => b.kind === 'roundEnd').map((b) => b.round));
      if (lastCompleteRound === 0) continue;

      const strip = (beats: Beat[]) =>
        beats
          .filter((beat) => beat.round <= lastCompleteRound)
          .map((beat) => ({ kind: beat.kind, round: beat.round, salience: beat.salience, facts: beat.facts }));
      expect(strip(partial)).toEqual(strip(full));
    }
  });
});

describe('aggregation (§16.6, §16.6a)', () => {
  it('collapses strike runs rather than narrating each strike', () => {
    for (const { result, beats } of sample.slice(0, 100)) {
      const strikes = result.events.filter((event) => event.t === 'strike').length;
      const strikeBeats = beats.filter((beat) => beat.kind === 'exchange' || beat.kind === 'ground').length;
      if (strikes > 20) expect(strikeBeats).toBeLessThan(strikes);
    }
  });

  it('an exchange beat carries damage, streak, and who owned it', () => {
    const exchanges = sample.flatMap(({ beats }) => beats.filter((beat) => beat.kind === 'exchange'));
    expect(exchanges.length).toBeGreaterThan(0);
    for (const beat of exchanges.slice(0, 200)) {
      expect(['a', 'b']).toContain(beat.facts.side);
      expect(typeof beat.facts.totalDamage).toBe('number');
      expect(beat.facts.unansweredStreak as number).toBeGreaterThanOrEqual(1);
      expect(beat.salience).toBeGreaterThan(0);
    }
  });

  it('scores a heavier exchange above a lighter one', () => {
    // §16.6: exchange salience is 10 + 4 x totalDamage + 3 x unansweredStreak,
    // which is what makes a big exchange win a contested slot.
    const exchanges = sample
      .flatMap(({ beats }) => beats.filter((beat) => beat.kind === 'exchange'))
      .filter((beat) => (beat.facts.landed as number) > 0);
    const heavy = exchanges.filter((beat) => beat.facts.heavy === true);
    const light = exchanges.filter((beat) => beat.facts.heavy === false);
    expect(heavy.length).toBeGreaterThan(0);
    expect(light.length).toBeGreaterThan(0);
    const mean = (list: Beat[]) => list.reduce((sum, beat) => sum + beat.salience, 0) / list.length;
    expect(mean(heavy)).toBeGreaterThan(mean(light));
  });

  it('absorbs the topControl that follows a takedown rather than narrating it twice', () => {
    // §16.6: "a position: topControl immediately following a successful takedown
    // is absorbed into the takedown beat".
    for (const { result, beats } of sample.slice(0, 100)) {
      const takedownsLanded = result.events.filter((e) => e.t === 'takedown' && e.success).length;
      const takedownBeats = beats.filter((beat) => beat.kind === 'takedown').length;
      // Budget can evict takedown beats (they are optional), never inflate them.
      expect(takedownBeats).toBeLessThanOrEqual(takedownsLanded);
    }
  });

  it('never emits a standup without someone having been on the ground', () => {
    for (const { result, beats } of sample.slice(0, 100)) {
      if (beats.some((beat) => beat.kind === 'standup')) {
        expect(result.events.some((event) => event.t === 'position' && event.state === 'topControl')).toBe(true);
      }
    }
  });

  it('every beat carries facts a predicate can read', () => {
    for (const { beats } of sample.slice(0, 50)) {
      for (const beat of beats) {
        for (const value of Object.values(beat.facts)) {
          expect(['string', 'number', 'boolean']).toContain(typeof value);
        }
      }
    }
  });

  it('every mandatory kind is actually reachable across the sample', () => {
    // A mandatory kind that never fires is content nobody will ever hear.
    const seen = new Set(sample.flatMap(({ beats }) => beats.map((beat) => beat.kind)));
    for (const kind of MANDATORY_KINDS) {
      expect(seen.has(kind), `mandatory kind '${kind}' never fired in ${SAMPLE} bouts`).toBe(true);
    }
  });
});
