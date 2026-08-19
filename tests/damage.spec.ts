// Loop 7.2 — the damage re-tune, guarded (DESIGN.md §6.4, §16.1).
//
// §16.1 measured the shipped engine over 400 seeded bouts and found §6.4's
// damage-accumulation curve was not running: strike damage p50 was 0.13, health
// never fell below 85.9, `knockdown` fired 0 times and `finish: TKO` 0 times.
// Every knockout came from a flat 1.6%-per-significant-strike roll against a
// chin that never degraded, which makes the health bar decorative, gives
// portrait wear (§15.4) nothing to read, and leaves §16.6's `rocked` beat with
// no event to fire on.
//
// The fix was balance.json alone (baseStrikeDamage 0.3 -> 2.8,
// significantStrikeChance 0.016 -> 0.010; see lab/report.ts for the measured
// before/after and why kFinish stayed at 6). These tests are the guard: they
// re-measure the same three quantities so a future balance edit cannot quietly
// flatten the curve again. The M1 acceptance gates that bound the same change
// live in tests/lab.spec.ts and are unchanged.

import { describe, expect, it } from 'vitest';
import { simulateFight } from '../src/engine/fight';
import { mulberry32 } from '../src/engine/rng';
import type { Fighter, FightEvent, Tactics } from '../src/engine/types';
import { archetypes, balance } from '../src/content';
import { deriveHudState, healthTone } from '../src/ui/screens/FightScreen';

const BOUTS = 400;
const noTactics: Tactics = {};

function fighterFromArchetype(id: string, archetypeId: string): Fighter {
  const archetype = archetypes.find((entry) => entry.id === archetypeId);
  if (!archetype) throw new Error(`missing archetype fixture '${archetypeId}'`);
  return {
    id,
    name: archetype.label,
    nationality: 'lab',
    face: '000000000',
    weightClass: 'lab',
    stance: 'orthodox',
    attributes: { ...archetype.attributes },
    archetype: archetype.id,
    weakness: null,
    record: { wins: 0, losses: 0, draws: 0, noContests: 0 },
    traits: [],
    condition: { health: 100, injuries: [] },
  };
}

interface Sample {
  methods: Record<string, number>;
  boutsWithKnockdown: number;
  knockdownsPerFighterPerBout: number[];
  lowestHealthOverall: number;
  strikeDamages: number[];
}

// Health is not on the event log as a level, only as per-strike deltas — the
// same reconstruction the HUD does (deriveHudState), so this measures exactly
// what a player would see on the bar.
function sampleBouts(bouts: number): Sample {
  const ids = archetypes.map((entry) => entry.id);
  const pairings: [string, string][] = [];
  for (const x of ids) for (const y of ids) if (x !== y) pairings.push([x, y]);

  const sample: Sample = {
    methods: {},
    boutsWithKnockdown: 0,
    knockdownsPerFighterPerBout: [],
    lowestHealthOverall: 100,
    strikeDamages: [],
  };

  let seed = 0;
  let n = 0;
  while (n < bouts) {
    for (const [x, y] of pairings) {
      if (n >= bouts) break;
      const a = fighterFromArchetype('a', x);
      const b = fighterFromArchetype('b', y);
      const result = simulateFight(a, b, noTactics, mulberry32(seed++));
      n++;

      sample.methods[result.method] = (sample.methods[result.method] ?? 0) + 1;

      const knockdowns: Record<string, number> = { a: 0, b: 0 };
      for (const event of result.events) {
        if (event.t === 'strike' && event.landed) sample.strikeDamages.push(event.damage);
        if (event.t === 'knockdown') knockdowns[event.who]++;
      }
      sample.knockdownsPerFighterPerBout.push(knockdowns.a, knockdowns.b);
      if (knockdowns.a + knockdowns.b > 0) sample.boutsWithKnockdown++;

      const hud = deriveHudState(result.events, result.events.length, a.id, b.id);
      sample.lowestHealthOverall = Math.min(sample.lowestHealthOverall, hud.healthA, hud.healthB);
    }
  }
  return sample;
}

const sample = sampleBouts(BOUTS);

function median(values: number[]): number {
  const sorted = [...values].sort((p, q) => p - q);
  return sorted[Math.floor(sorted.length / 2)];
}

describe('damage accumulation is live (§16.1 re-measured)', () => {
  it('knockdown fires in a measurable share of bouts — it fired 0 times in 400 before the re-tune', () => {
    expect(sample.boutsWithKnockdown / BOUTS).toBeGreaterThanOrEqual(0.15);
  });

  it('finish: TKO is reachable — it was unreachable by construction before the re-tune', () => {
    expect(sample.methods.TKO ?? 0).toBeGreaterThan(0);
  });

  it('health traverses a real range, well below knockdownHealthThreshold', () => {
    // Before: the lowest health reached across 400 bouts was 85.9, against a
    // knockdown threshold of 55 and a TKO threshold of 35 — both unreachable.
    expect(sample.lowestHealthOverall).toBeLessThan(balance.tkoHealthThreshold);
    expect(balance.tkoHealthThreshold).toBeLessThan(balance.knockdownHealthThreshold);
  });

  it('a landed strike costs more than a rounding error', () => {
    // Before: p50 damage 0.13, so ~60 landed strikes across a bout took roughly
    // 8 points off a 100-point bar.
    expect(median(sample.strikeDamages)).toBeGreaterThan(0.5);
  });

  it('both finish routes stay live — neither KO/TKO nor SUB is decorative', () => {
    const stoppages = (sample.methods.KO ?? 0) + (sample.methods.TKO ?? 0);
    expect(stoppages / BOUTS).toBeGreaterThan(0.05);
    expect((sample.methods.SUB ?? 0) / BOUTS).toBeGreaterThan(0.05);
  });

  it('decisions survive the re-tune — narration synthesises a beat for them (§16.1)', () => {
    const decisions = (sample.methods.UD ?? 0) + (sample.methods.SD ?? 0) + (sample.methods.MD ?? 0);
    expect(decisions / BOUTS).toBeGreaterThan(0.15);
  });
});

describe('the rocked recovery rule (§6.4, §16.6)', () => {
  it('knockdown is a crossing, not a level: at most one per fighter per bout', () => {
    // Health is monotonically non-increasing within a bout, so the latch in
    // fight.ts makes `knockdown` fire on the downward crossing of the
    // threshold. Clearing that latch at roundEnd would turn it into a level
    // check and re-emit the event on the first landed strike of every
    // subsequent round — see the comment at the emit site.
    expect(Math.max(...sample.knockdownsPerFighterPerBout)).toBe(1);
  });

  it("the HUD's Hurt flag clears at the round break", () => {
    const events: FightEvent[] = [
      { t: 'knockdown', who: 'a', round: 1 },
      { t: 'roundEnd', round: 1, scoreA: 3, scoreB: 5, staminaA: 70, staminaB: 74 },
      { t: 'strike', by: 'a', kind: 'strike', landed: true, damage: 1.2, round: 2 },
    ];

    // Rocked while the round it happened in is still on screen...
    expect(deriveHudState(events, 1, 'a', 'b').rockedA).toBe(true);
    // ...and recovered once the round break has been revealed.
    expect(deriveHudState(events, 2, 'a', 'b').rockedA).toBe(false);
    expect(deriveHudState(events, 3, 'a', 'b').rockedA).toBe(false);
  });

  it('the health meter keeps carrying the damage after the Hurt flag clears', () => {
    // The knockdown's lasting cost lives on the bar, which does not recover —
    // §15.2's amber is "rocked, gassed, injured", and a fighter below the
    // knockdown threshold is still all three.
    expect(healthTone(balance.knockdownHealthThreshold - 1)).toBe('warn');
    expect(healthTone(balance.knockdownHealthThreshold + 1)).toBe('default');
  });
});
