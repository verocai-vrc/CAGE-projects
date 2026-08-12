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

function fighterFromArchetype(id: string, archetypeId: string): Fighter {
  const archetype = archetypes.find((entry) => entry.id === archetypeId);
  if (!archetype) throw new Error(`lab: missing archetype fixture '${archetypeId}'`);
  return {
    id,
    name: archetype.label,
    nationality: 'lab',
    weightClass: 'lab',
    stance: 'orthodox',
    attributes: { ...archetype.attributes },
    archetype: archetype.id,
    weakness: null,
    traits: [],
    condition: { health: 100, injuries: [] },
  };
}

const emptyTactics: Tactics = {};

export function runArchetypePairing(
  archetypeAId: string,
  archetypeBId: string,
  n: number,
  seedOffset = 0,
): SimFightRecord[] {
  const a = fighterFromArchetype('lab-a', archetypeAId);
  const b = fighterFromArchetype('lab-b', archetypeBId);
  const records: SimFightRecord[] = [];

  for (let i = 0; i < n; i++) {
    const result = simulateFight(a, b, emptyTactics, mulberry32(seedOffset + i));
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
export function runAllPairings(n = 10_000): SimFightRecord[] {
  const ids = archetypes.map((entry) => entry.id);
  const all: SimFightRecord[] = [];
  let seedOffset = 0;

  for (const idA of ids) {
    for (const idB of ids) {
      if (idA === idB) continue;
      all.push(...runArchetypePairing(idA, idB, n, seedOffset));
      seedOffset += n;
    }
  }
  return all;
}
