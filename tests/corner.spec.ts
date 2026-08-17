// Loop 2.3 — corner decisions: proves a mid-fight tactic change is
// load-bearing (diverges the event log) rather than cosmetic, and that
// replaying the same seed with an unchanged tactics prefix reproduces a
// byte-identical event prefix (the FightScreen re-simulate-on-choice trick).

import { describe, expect, it } from 'vitest';
import { simulateFight } from '../src/engine/fight';
import { mulberry32 } from '../src/engine/rng';
import type { Fighter, FightResult, Tactics, TacticId } from '../src/engine/types';
import { archetypes } from '../src/content';

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
    traits: [],
    condition: { health: 100, injuries: [] },
  };
}

const fighterA = fighterFromArchetype('fighter-a', 'striker');
const fighterB = fighterFromArchetype('fighter-b', 'wrestler');

describe('corner decisions (Loop 2.3)', () => {
  it('a different round-2 corner call diverges the event log from round 2 onward, for some seed', () => {
    let divergedAt = -1;
    let baseline: ReturnType<typeof simulateFight> | null = null;
    let changed: ReturnType<typeof simulateFight> | null = null;

    for (let seed = 0; seed < 100; seed++) {
      // Both plans set an explicit round-2 tactic (so both logs get a
      // cornerCall event at the same index) — only the tactic id differs,
      // isolating divergence to its effect on round-2 rolls rather than to
      // the mere presence/absence of the annotation event.
      const baseTactics: Tactics = {
        [fighterA.id]: { cutQuality: 'clean', rounds: { 1: 'balanced', 2: 'balanced' } },
      };
      const changedTactics: Tactics = {
        [fighterA.id]: { cutQuality: 'clean', rounds: { 1: 'balanced', 2: 'shootTakedowns' } },
      };

      const resultBase = simulateFight(fighterA, fighterB, baseTactics, mulberry32(seed));
      if (resultBase.endRound < 2) continue; // fight must actually reach round 2

      const resultChanged = simulateFight(fighterA, fighterB, changedTactics, mulberry32(seed));

      // Find the first event index where the two logs differ.
      const minLen = Math.min(resultBase.events.length, resultChanged.events.length);
      let idx = -1;
      for (let i = 0; i < minLen; i++) {
        if (JSON.stringify(resultBase.events[i]) !== JSON.stringify(resultChanged.events[i])) {
          idx = i;
          break;
        }
      }
      if (idx === -1 && resultBase.events.length === resultChanged.events.length) continue; // identical outcome this seed, try another

      divergedAt = idx;
      baseline = resultBase;
      changed = resultChanged;
      break;
    }

    expect(baseline).not.toBeNull();
    expect(changed).not.toBeNull();
    expect(divergedAt).toBeGreaterThanOrEqual(0);

    // Round 1 must be byte-identical in both logs (the tactics prefix up to
    // round 1 is unchanged) — the first difference can only be the round-2
    // cornerCall event (differs by construction: 'balanced' vs
    // 'shootTakedowns') or something at round >= 2.
    const firstDiffEvent = baseline!.events[divergedAt];
    expect(firstDiffEvent.round).toBeGreaterThanOrEqual(2);

    // Proves the tactic choice is load-bearing, not merely logged: the
    // round-2+ behavior itself (strikes/takedowns/positions/finish), not
    // just the cornerCall annotation, differs between the two runs.
    const behaviorBase = baseline!.events.filter((e) => e.round >= 2 && e.t !== 'cornerCall');
    const behaviorChanged = changed!.events.filter((e) => e.round >= 2 && e.t !== 'cornerCall');
    expect(JSON.stringify(behaviorBase)).not.toBe(JSON.stringify(behaviorChanged));
  });

  it('replaying the same seed with an unchanged tactics prefix reproduces an identical event prefix', () => {
    const seed = 55;
    const round1Tactics: Tactics = {
      [fighterA.id]: { cutQuality: 'clean', rounds: { 1: 'headhunt' } },
    };
    const round1And2Tactics: Tactics = {
      [fighterA.id]: { cutQuality: 'clean', rounds: { 1: 'headhunt', 2: 'protectLead' } },
    };

    const before = simulateFight(fighterA, fighterB, round1Tactics, mulberry32(seed));
    const after = simulateFight(fighterA, fighterB, round1And2Tactics, mulberry32(seed));

    const round1EndIdx = before.events.findIndex((e) => e.t === 'roundEnd' && e.round === 1);
    expect(round1EndIdx).toBeGreaterThanOrEqual(0);

    // Everything through the end of round 1 must be byte-identical: a
    // round-2 tactic is never read before round 2, so every roll in round 1
    // sees identical inputs and draws the same values from the same stream.
    // (This holds per round, not per tick — RNG consumption inside a round
    // is outcome-dependent, so a tactic change shifts the stream from the
    // round it takes effect onward.)
    for (let i = 0; i <= round1EndIdx; i++) {
      expect(after.events[i]).toEqual(before.events[i]);
    }
  });
});

// --- Each tactic's characteristic trade-off (DESIGN.md §6.7) ---
//
// Single fights are noisy, so these aggregate over many seeds and assert the
// direction of the effect rather than any one fight's outcome. Fighter A runs
// the tactic under test for every round; fighter B always stays 'balanced'.

const SEEDS = 300;

function allRounds(tactic: TacticId): Tactics {
  return { [fighterA.id]: { cutQuality: 'clean', rounds: { 1: tactic, 2: tactic, 3: tactic } } };
}

// Runs SEEDS fights with A on `tactic`, returning per-fight measurements.
function sweep(tactic: TacticId): FightResult[] {
  const results: FightResult[] = [];
  for (let seed = 0; seed < SEEDS; seed++) {
    results.push(simulateFight(fighterA, fighterB, allRounds(tactic), mulberry32(seed)));
  }
  return results;
}

function meanFinalStamina(results: FightResult[], side: 'A' | 'B'): number {
  let total = 0;
  let count = 0;
  for (const result of results) {
    // The last roundEnd carries the stamina reading at that point.
    for (let i = result.events.length - 1; i >= 0; i--) {
      const event = result.events[i];
      if (event.t === 'roundEnd') {
        total += side === 'A' ? event.staminaA : event.staminaB;
        count++;
        break;
      }
    }
  }
  return count === 0 ? 0 : total / count;
}

function countStrikesBy(results: FightResult[], fighterId: string): number {
  let total = 0;
  for (const result of results) {
    for (const event of result.events) {
      if (event.t === 'strike' && event.by === fighterId) total++;
    }
  }
  return total;
}

function countStrikesInRound(results: FightResult[], fighterId: string, round: number): number {
  let total = 0;
  for (const result of results) {
    for (const event of result.events) {
      if (event.t === 'strike' && event.by === fighterId && event.round === round) total++;
    }
  }
  return total;
}

function totalDamageBy(results: FightResult[], fighterId: string): number {
  let total = 0;
  for (const result of results) {
    for (const event of result.events) {
      if (event.t === 'strike' && event.by === fighterId) total += event.damage;
    }
  }
  return total;
}

describe('tactic trade-offs (DESIGN.md §6.7)', () => {
  const balancedRuns = sweep('balanced');

  // pressPace buys a fast start and pays for it late (DESIGN.md §6.3's
  // "fast starter who fades"). Note it is NOT a whole-fight volume gain:
  // stamina multiplies accuracy on every later roll, so the drain compounds
  // and total strikes over 3 rounds actually fall. The payoff is round 1.
  it('pressPace trades a round-1 surge for a late-round fade', () => {
    const pressRuns = sweep('pressPace');

    // The stamina cost is the defining trade-off: A ends rounds more tired.
    expect(meanFinalStamina(pressRuns, 'A')).toBeLessThan(meanFinalStamina(balancedRuns, 'A'));

    // Round 1, while still fresh: the striking bonus dominates, A lands more.
    expect(countStrikesInRound(pressRuns, fighterA.id, 1)).toBeGreaterThan(
      countStrikesInRound(balancedRuns, fighterA.id, 1),
    );

    // By the final round the compounding drain has taken over: A lands less.
    expect(countStrikesInRound(pressRuns, fighterA.id, 3)).toBeLessThan(
      countStrikesInRound(balancedRuns, fighterA.id, 3),
    );
  });

  it('protectLead trades offense for safety — A lands less, and is hit less', () => {
    const protectRuns = sweep('protectLead');

    // A throws/lands less (own striking penalty)...
    expect(countStrikesBy(protectRuns, fighterA.id)).toBeLessThan(
      countStrikesBy(balancedRuns, fighterA.id),
    );

    // ...and is harder to hit (defense bonus), so B lands less too.
    expect(countStrikesBy(protectRuns, fighterB.id)).toBeLessThan(
      countStrikesBy(balancedRuns, fighterB.id),
    );
  });

  it('headhunt trades accuracy for power — A lands less often but hits harder', () => {
    const headhuntRuns = sweep('headhunt');

    // Accuracy cost: fewer landed strikes.
    expect(countStrikesBy(headhuntRuns, fighterA.id)).toBeLessThan(
      countStrikesBy(balancedRuns, fighterA.id),
    );

    // Power gain: each landed strike does strictly more damage, so mean
    // damage per landed strike rises even though the count falls.
    const headhuntPerStrike =
      totalDamageBy(headhuntRuns, fighterA.id) / countStrikesBy(headhuntRuns, fighterA.id);
    const balancedPerStrike =
      totalDamageBy(balancedRuns, fighterA.id) / countStrikesBy(balancedRuns, fighterA.id);
    expect(headhuntPerStrike).toBeGreaterThan(balancedPerStrike);
  });

  it('every TacticId is load-bearing — none leaves the event log untouched', () => {
    const baseline = JSON.stringify(balancedRuns.map((r) => r.events));
    const tactics: TacticId[] = ['pressPace', 'shootTakedowns', 'protectLead', 'headhunt'];

    for (const tactic of tactics) {
      const runs = sweep(tactic);
      expect(JSON.stringify(runs.map((r) => r.events)), `${tactic} did not change the fight`).not.toBe(
        baseline,
      );
    }
  });
});
