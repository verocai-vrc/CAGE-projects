// Loop 2.4 — player moments (DESIGN.md §7).
//
// The sim always owns the probability: simulateFight rolls every moment
// itself, and an unaided roll IS the auto-resolve path — a player who never
// opens the moment UI gets exactly the model the engine would apply anyway.
// Playing a moment by hand supplies a PERFORMANCE (-1..+1) which tilts that
// roll by at most balance.momentSkillSwing; it never dictates the outcome.

import { describe, expect, it } from 'vitest';
import { simulateFight } from '../src/engine/fight';
import { mulberry32 } from '../src/engine/rng';
import type { Fighter, FightEvent, MomentOverrides, Tactics } from '../src/engine/types';
import { archetypes, balance } from '../src/content';

function fighterFromArchetype(id: string, archetypeId: string): Fighter {
  const archetype = archetypes.find((entry) => entry.id === archetypeId);
  if (!archetype) throw new Error(`missing archetype fixture: ${archetypeId}`);
  return {
    id,
    name: id,
    nationality: 'testland',
    face: '000000000',
    weightClass: 'lightweight',
    stance: 'orthodox',
    attributes: { ...archetype.attributes },
    archetype: archetype.id,
    weakness: null,
    record: { wins: 0, losses: 0, draws: 0, noContests: 0 },
    traits: [],
    condition: { health: 100, injuries: [] },
  };
}

const fighterA = fighterFromArchetype('fighter-a', 'striker');
const fighterB = fighterFromArchetype('fighter-b', 'wrestler');
const emptyTactics: Tactics = {};

type MomentEvent = Extract<FightEvent, { t: 'playerMoment' }>;

function momentsOf(events: FightEvent[]): MomentEvent[] {
  return events.filter((e): e is MomentEvent => e.t === 'playerMoment');
}

// Finds a seed whose fight contains at least `n` moments.
function seedWithMoments(n: number, overrides: MomentOverrides = {}): number {
  for (let seed = 0; seed < 500; seed++) {
    const result = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed), overrides);
    if (momentsOf(result.events).length >= n) return seed;
  }
  throw new Error(`no seed under 500 produced ${n} moment(s)`);
}

describe('player moments (Loop 2.4)', () => {
  it('respects the per-fight cap and indexes moments sequentially from 0', () => {
    for (let seed = 0; seed < 300; seed++) {
      const result = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed));
      const moments = momentsOf(result.events);

      expect(moments.length).toBeLessThanOrEqual(balance.maxMomentsPerFight);
      moments.forEach((moment, i) => {
        expect(moment.index).toBe(i);
      });
    }
  });

  it('marks engine-resolved moments as not played (the auto-resolve path)', () => {
    const seed = seedWithMoments(1);
    const moments = momentsOf(simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed)).events);

    expect(moments.length).toBeGreaterThan(0);
    for (const moment of moments) expect(moment.played).toBe(false);
  });

  // The loop's explicit verify: the auto-resolved distribution must not be
  // degenerate. Measured on a MIRROR matchup — moment rolls are a contested
  // pillar-vs-pillar check like everything else (§6.2), so a lopsided
  // matchup legitimately produces a lopsided rate (a striker should rarely
  // out-scramble a wrestler). A mirror isolates the mechanic from the
  // matchup and is the honest test of "is the roll live at all".
  it('auto-resolved outcomes are not degenerate over N seeded trials', () => {
    const mirrorA = fighterFromArchetype('mirror-a', 'allrounder');
    const mirrorB = fighterFromArchetype('mirror-b', 'allrounder');

    let success = 0;
    let fail = 0;
    for (let seed = 0; seed < 400; seed++) {
      for (const moment of momentsOf(
        simulateFight(mirrorA, mirrorB, emptyTactics, mulberry32(seed)).events,
      )) {
        if (moment.outcome === 'success') {
          success++;
        } else {
          fail++;
        }
      }
    }

    const total = success + fail;
    expect(total).toBeGreaterThan(100); // enough samples to be meaningful
    expect(success).toBeGreaterThan(0);
    expect(fail).toBeGreaterThan(0);

    // Not merely non-zero — actually balanced on an even matchup.
    const successRate = success / total;
    expect(successRate).toBeGreaterThan(0.25);
    expect(successRate).toBeLessThan(0.75);
  });

  it('a supplied performance marks the moment as played', () => {
    const seed = seedWithMoments(1);
    const auto = momentsOf(simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed)).events);

    const played = momentsOf(
      simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed), { 0: 1 }).events,
    );

    expect(played[0].played).toBe(true);
    expect(played[0].kind).toBe(auto[0].kind);
  });

  // Performance 0 is defined as "no help", so it must be indistinguishable
  // from not playing at all — this is what makes skipping fair (§7).
  it('performance 0 is identical to the unaided roll', () => {
    const seed = seedWithMoments(1);

    const unaided = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed));
    const neutral = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed), { 0: 0 });

    // Only `played` may differ; every outcome must match.
    expect(momentsOf(neutral.events).map((m) => m.outcome)).toEqual(
      momentsOf(unaided.events).map((m) => m.outcome),
    );
    expect(neutral.winnerId).toBe(unaided.winnerId);
    expect(neutral.method).toBe(unaided.method);
  });

  // The core of the bounded-swing contract (§7): skill moves the odds, the
  // engine still decides. Measured in aggregate, since any single moment is
  // just one roll.
  it('performance tilts the odds without dictating the outcome', () => {
    const mirrorA = fighterFromArchetype('mirror-a', 'allrounder');
    const mirrorB = fighterFromArchetype('mirror-b', 'allrounder');

    function successRate(performance: number | null): number {
      let success = 0;
      let total = 0;
      for (let seed = 0; seed < 600; seed++) {
        const overrides: MomentOverrides = {};
        if (performance !== null) {
          for (let i = 0; i < balance.maxMomentsPerFight; i++) overrides[i] = performance;
        }
        for (const moment of momentsOf(
          simulateFight(mirrorA, mirrorB, emptyTactics, mulberry32(seed), overrides).events,
        )) {
          if (moment.outcome === 'success') success++;
          total++;
        }
      }
      return total === 0 ? 0 : success / total;
    }

    const best = successRate(1);
    const worst = successRate(-1);
    const unaided = successRate(null);

    // Skill is real: perfect play beats worst play by a wide margin...
    expect(best).toBeGreaterThan(unaided);
    expect(worst).toBeLessThan(unaided);

    // ...but bounded: even perfect play never becomes a guarantee, and even
    // the worst play never becomes hopeless. The engine still decides.
    expect(best).toBeLessThan(0.95);
    expect(worst).toBeGreaterThan(0.05);
  });

  // A hopeless matchup stays hopeless however well the player executes —
  // matchup-over-rating (DESIGN.md §1) applies to moments too.
  it('perfect play cannot rescue a badly mismatched exchange', () => {
    // fighterA is a striker; scrambles against a wrestler are a losing pillar.
    function grapplingMomentRate(performance: number): number {
      let success = 0;
      let total = 0;
      for (let seed = 0; seed < 600; seed++) {
        const overrides: MomentOverrides = {};
        for (let i = 0; i < balance.maxMomentsPerFight; i++) overrides[i] = performance;
        for (const moment of momentsOf(
          simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed), overrides).events,
        )) {
          if (moment.kind === 'scramble') {
            if (moment.outcome === 'success') success++;
            total++;
          }
        }
      }
      return total === 0 ? 0 : success / total;
    }

    // Playing perfectly helps, but the striker still loses most scrambles.
    expect(grapplingMomentRate(1)).toBeLessThan(0.5);
  });

  // The reason the engine rolls even when a performance is supplied:
  // consumption per moment is constant, so playing a moment cannot move a
  // later moment onto a different exchange.
  it('a performance does not shift which exchanges produce moments', () => {
    const seed = seedWithMoments(2);
    const auto = momentsOf(simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed)).events);

    const moments = momentsOf(
      simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed), { 0: 1 }).events,
    );

    expect(moments[0].kind).toBe(auto[0].kind);
    expect(moments[0].round).toBe(auto[0].round);
    expect(moments.length).toBe(auto.length);
  });

  // The invariant FightScreen's mid-playback result swap depends on: when a
  // moment is played, the fight is re-simulated and `result` is replaced
  // under an in-progress reveal. That is only safe if every event already on
  // screen is byte-identical in the new result.
  it('overriding a moment leaves every earlier event byte-identical', () => {
    let checked = 0;

    for (let seed = 0; seed < 120; seed++) {
      const auto = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed));

      auto.events.forEach((event, i) => {
        if (event.t !== 'playerMoment') return;
        const changed = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed), {
          [event.index]: 1,
        });

        // Everything strictly before the moment is untouched...
        expect(changed.events.slice(0, i)).toEqual(auto.events.slice(0, i));

        // ...and the moment keeps its identity (only its odds were tilted).
        const same = changed.events[i];
        expect(same.t).toBe('playerMoment');
        if (same.t === 'playerMoment') {
          expect(same.index).toBe(event.index);
          expect(same.kind).toBe(event.kind);
          expect(same.round).toBe(event.round);
        }
        checked++;
      });
    }

    expect(checked).toBeGreaterThan(0);
  });

  it('a played moment is load-bearing — a max performance diverges the event log', () => {
    // Find a seed where playing the first moment perfectly changes the fight.
    let diverged = false;
    for (let seed = 0; seed < 400 && !diverged; seed++) {
      const auto = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed));
      if (momentsOf(auto.events).length === 0) continue;

      const changed = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed), { 0: 1 });

      // Compare everything after the moment itself; `played` on the moment
      // event differs by construction, so that alone would prove nothing.
      const idx = changed.events.findIndex((e) => e.t === 'playerMoment');
      const autoTail = JSON.stringify(auto.events.slice(idx + 1));
      const changedTail = JSON.stringify(changed.events.slice(idx + 1));
      if (autoTail !== changedTail) diverged = true;
    }

    expect(diverged).toBe(true);
  });

  it('is deterministic: same seed + same overrides => byte-identical result', () => {
    const seed = seedWithMoments(1);
    const overrides: MomentOverrides = { 0: 1 };

    const first = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed), overrides);
    const second = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed), overrides);

    expect(first).toEqual(second);
  });

  it('omitting overrides entirely is equivalent to passing an empty map (zero-input playability)', () => {
    const seed = seedWithMoments(1);

    const implicit = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed));
    const explicit = simulateFight(fighterA, fighterB, emptyTactics, mulberry32(seed), {});

    expect(implicit).toEqual(explicit);
  });
});
