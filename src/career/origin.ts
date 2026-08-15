// origin.ts — Loop 3.5 stub. The real amateur wrapper (6 moments, budget
// conservation, reveal screen) is M4/Loop 4.3-4.4; this loop only needs a
// single hardcoded Origin so the career shell has something to build a
// fighter from and the camp -> fight -> aftermath -> retire loop can close.

import type { Attributes, Fighter, Origin } from '../engine/types';

// Every attribute starts here before origin.statDeltas are applied — stands
// in for the real wrapper's baseline until M4.
const BASE_ATTRIBUTE_VALUE = 50;

export const stubOrigin: Origin = {
  statDeltas: { power: 8, technique: 10, speed: 6, cardio: 6, chin: 4, fightIQ: 6 },
  archetype: 'allrounder',
  weakness: null,
  mentorGymId: 'iron-gate-gym',
  hypeModifier: 5,
  amateurRecord: { wins: 3, losses: 1 },
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

// Pure: builds a schema-valid Fighter from an Origin — baseline attributes
// plus the origin's deltas, clamped to the 0-100 range (DESIGN.md §4).
export function fighterFromOrigin(
  origin: Origin,
  id: string,
  name: string,
  nationality: string,
  weightClass: string,
): Fighter {
  const attributes: Attributes = {
    power: clamp(BASE_ATTRIBUTE_VALUE + (origin.statDeltas.power ?? 0)),
    technique: clamp(BASE_ATTRIBUTE_VALUE + (origin.statDeltas.technique ?? 0)),
    speed: clamp(BASE_ATTRIBUTE_VALUE + (origin.statDeltas.speed ?? 0)),
    wrestling: clamp(BASE_ATTRIBUTE_VALUE + (origin.statDeltas.wrestling ?? 0)),
    groundControl: clamp(BASE_ATTRIBUTE_VALUE + (origin.statDeltas.groundControl ?? 0)),
    chin: clamp(BASE_ATTRIBUTE_VALUE + (origin.statDeltas.chin ?? 0)),
    cardio: clamp(BASE_ATTRIBUTE_VALUE + (origin.statDeltas.cardio ?? 0)),
    fightIQ: clamp(BASE_ATTRIBUTE_VALUE + (origin.statDeltas.fightIQ ?? 0)),
  };

  return {
    id,
    name,
    nationality,
    weightClass,
    stance: 'orthodox',
    attributes,
    archetype: origin.archetype,
    weakness: origin.weakness,
    traits: [],
    condition: { health: 100, injuries: [] },
  };
}
