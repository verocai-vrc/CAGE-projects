// lab/simulate.ts — batch runner: N seeded sims across all archetype
// pairing fixtures (DESIGN.md §10). The lab reads the same balance.json +
// content fixtures the game does; balance changes are tuned by editing
// that file and re-running this, never by editing engine code.

import { simulateFight } from '../engine/fight';
import { mulberry32 } from '../engine/rng';
import type { Fighter, Tactics } from '../engine/types';
import { archetypes } from '../content';

export interface SimFightRecord {
  archetypeA: string;
  archetypeB: string;
  winner: 'a' | 'b' | 'draw';
  method: string;
  endRound: number;
  eventCount: number;
}

// Loop 7.3: the three ids §16.5 makes into engine modifiers, in a fixed order
// so a weakness-enabled batch is as reproducible as a plain one.
const WEAKNESS_IDS = ['striking-defense', 'takedown-defense', 'submission-defense'] as const;

function fighterFromArchetype(id: string, archetypeId: string, weakness: string | null = null): Fighter {
  const archetype = archetypes.find((entry) => entry.id === archetypeId);
  if (!archetype) throw new Error(`lab: missing archetype fixture '${archetypeId}'`);
  return {
    id,
    name: archetype.label,
    nationality: 'lab',
    // Never rendered as a Portrait — the lab is a headless batch runner — so a
    // fixed placeholder is correct here rather than importing ui/portrait for no
    // visual gain. See fighterFromArchetype's counterpart in FightScreen.tsx.
    face: '000000000',
    weightClass: 'lab',
    stance: 'orthodox',
    attributes: { ...archetype.attributes },
    archetype: archetype.id,
    weakness,
    traits: [],
    condition: { health: 100, injuries: [] },
  };
}

const emptyTactics: Tactics = {};

/**
 * Loop 7.3 (§16.5). The default batch leaves both sides `weakness: null` — it is
 * the controlled fixture the M1 gates were tuned against, and one uncontrolled
 * variable would make the win-rate matrix unreadable.
 *
 * `withWeaknesses` re-runs the same batch with a weakness drawn per fighter per
 * fight from a stream derived off the fight seed, which is how the shipped game
 * looks once matchmaking hands opponents a real hole. The gates have to hold in
 * both modes: if the matrix only balances when nobody has a weakness, the
 * weakness is not a hole, it is a handicap on whoever happens to carry one.
 */
export interface PairingOptions {
  withWeaknesses?: boolean;
}

// Derived off the fight seed rather than the caller's rng so enabling
// weaknesses cannot shift the fight's own random stream — the same discipline
// the engine follows for moment overrides.
function weaknessForSeed(seed: number, side: 0 | 1, enabled: boolean): string | null {
  if (!enabled) return null;
  const rng = mulberry32(seed * 2 + side + 1);
  if (rng.next() >= 0.55) return null;
  return WEAKNESS_IDS[Math.floor(rng.next() * WEAKNESS_IDS.length)];
}

export function runArchetypePairing(
  archetypeAId: string,
  archetypeBId: string,
  n: number,
  seedOffset = 0,
  options: PairingOptions = {},
): SimFightRecord[] {
  const withWeaknesses = options.withWeaknesses ?? false;
  const records: SimFightRecord[] = [];

  for (let i = 0; i < n; i++) {
    const seed = seedOffset + i;
    const a = fighterFromArchetype('lab-a', archetypeAId, weaknessForSeed(seed, 0, withWeaknesses));
    const b = fighterFromArchetype('lab-b', archetypeBId, weaknessForSeed(seed, 1, withWeaknesses));
    const result = simulateFight(a, b, emptyTactics, mulberry32(seed));
    let winner: 'a' | 'b' | 'draw' = 'draw';
    if (result.winnerId === a.id) winner = 'a';
    else if (result.winnerId === b.id) winner = 'b';
    records.push({
      archetypeA: archetypeAId,
      archetypeB: archetypeBId,
      winner,
      method: result.method,
      endRound: result.endRound,
      eventCount: result.events.length,
    });
  }
  return records;
}

// Every ordered archetype pairing (A vs B and B vs A are simulated
// separately, since who gets the tick-order edge each round is not
// symmetric), N seeds each, non-overlapping seed ranges per pairing so no
// two pairings replay the same sequence.
export function runAllPairings(n = 10_000, options: PairingOptions = {}): SimFightRecord[] {
  const ids = archetypes.map((entry) => entry.id);
  const all: SimFightRecord[] = [];
  let seedOffset = 0;

  for (const idA of ids) {
    for (const idB of ids) {
      if (idA === idB) continue;
      all.push(...runArchetypePairing(idA, idB, n, seedOffset, options));
      seedOffset += n;
    }
  }
  return all;
}
