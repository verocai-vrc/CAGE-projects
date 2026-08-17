// origin.ts — Loop 4.3 built the real amateur wrapper: DESIGN.md §9.1's 6
// formative moments (content/events/amateur.json), each contributing one
// chosen option's statDeltas plus, on one moment, a narrated weakness and
// the mentor gym. Budget conservation is enforced structurally in
// state/schema.ts's AmateurMomentSchema, not here. Loop 4.4 adds the §9.3
// skip path (rollRandomOrigin) and deletes the Loop 3.5 stub Origin — both
// paths now go through buildOriginFromChoices, so there is exactly one way
// a valid Origin gets made.

import type { RNG } from '../engine';
import type { ArchetypeId, Attributes, Fighter, Origin, WeaknessId } from '../engine/types';
import type { AmateurMoment, MomentOption } from '../state/schema';

// Every attribute starts here before origin.statDeltas are applied.
const BASE_ATTRIBUTE_VALUE = 50;
const DEFAULT_MENTOR_GYM_ID = 'neighborhood-gym';

const STRIKING_ATTRIBUTES: (keyof Attributes)[] = ['power', 'technique', 'speed'];
const GRAPPLING_ATTRIBUTES: (keyof Attributes)[] = ['wrestling', 'groundControl'];

function pillarTotal(statDeltas: Partial<Attributes>, keys: (keyof Attributes)[]): number {
  return keys.reduce((sum, key) => sum + (statDeltas[key] ?? 0), 0);
}

// No archetype content is imported here on purpose (career/origin.ts stays
// decoupled from /content, same as matchmaking.ts) — classification is a
// simple read of which pillar the player's choices leaned into. The
// resulting id ('striker' | 'wrestler' | 'allrounder') matches
// content/archetypes.json's ids by convention, not by import.
function classifyArchetype(statDeltas: Partial<Attributes>): ArchetypeId {
  const striking = pillarTotal(statDeltas, STRIKING_ATTRIBUTES);
  const grappling = pillarTotal(statDeltas, GRAPPLING_ATTRIBUTES);
  const lean = striking - grappling;
  if (lean > 6) return 'striker';
  if (lean < -6) return 'wrestler';
  return 'allrounder';
}

// Amateur record is narrated, never simulated (DESIGN.md §9.1) — a fixed
// lookup from the built archetype, no RNG, no fight engine involved.
const AMATEUR_RECORD_BY_ARCHETYPE: Record<ArchetypeId, { amateurRecord: { wins: number; losses: number }; hypeModifier: number }> = {
  striker: { amateurRecord: { wins: 3, losses: 1 }, hypeModifier: 6 },
  wrestler: { amateurRecord: { wins: 4, losses: 0 }, hypeModifier: 5 },
  allrounder: { amateurRecord: { wins: 3, losses: 2 }, hypeModifier: 4 },
};

// Pure: folds the player's 6 chosen options (one per moment, in any order)
// into a complete Origin. The weakness and mentorGymId fields come from
// whichever chosen option happens to carry them (exactly one option per
// wrapper is expected to set each, by content construction) — falling back
// to "no weakness" / a default gym keeps this safe even against a partial
// or malformed choice set.
export function buildOriginFromChoices(chosenOptions: readonly MomentOption[]): Origin {
  const statDeltas: Partial<Attributes> = {};
  for (const option of chosenOptions) {
    for (const [key, value] of Object.entries(option.statDeltas)) {
      const attr = key as keyof Attributes;
      statDeltas[attr] = (statDeltas[attr] ?? 0) + (value ?? 0);
    }
  }

  const archetype = classifyArchetype(statDeltas);
  const weakness: WeaknessId | null = chosenOptions.find((o) => o.weakness)?.weakness ?? null;
  const mentorGymId = chosenOptions.find((o) => o.mentorGymId)?.mentorGymId ?? DEFAULT_MENTOR_GYM_ID;
  const { amateurRecord, hypeModifier } = AMATEUR_RECORD_BY_ARCHETYPE[archetype] ?? AMATEUR_RECORD_BY_ARCHETYPE.allrounder;

  return { statDeltas, archetype, weakness, mentorGymId, hypeModifier, amateurRecord };
}

// Skip path (DESIGN.md §9.3): "generate a valid Origin from the RNG and
// hand it to the same pro-debut entry point." Reusing buildOriginFromChoices
// is what makes that true — a random pick of one option per moment is fed
// through the exact same fold the montage path uses, so there is no second
// code path that could produce a differently-shaped Origin.
export function rollRandomOrigin(moments: readonly AmateurMoment[], rng: RNG): Origin {
  const chosen = moments.map((moment) => moment.options[Math.floor(rng.next() * moment.options.length)]);
  return buildOriginFromChoices(chosen);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

// Pure: baseline attributes plus the origin's deltas, clamped to the 0-100
// range (DESIGN.md §4). Exported on its own (not just via fighterFromOrigin)
// so the reveal screen (§9.2) can preview a fighter's stat spread without
// needing an id/name/nationality/weightClass yet — those only exist once
// the player commits to a pro debut.
export function attributesFromOrigin(origin: Origin): Attributes {
  return {
    power: clamp(BASE_ATTRIBUTE_VALUE + (origin.statDeltas.power ?? 0)),
    technique: clamp(BASE_ATTRIBUTE_VALUE + (origin.statDeltas.technique ?? 0)),
    speed: clamp(BASE_ATTRIBUTE_VALUE + (origin.statDeltas.speed ?? 0)),
    wrestling: clamp(BASE_ATTRIBUTE_VALUE + (origin.statDeltas.wrestling ?? 0)),
    groundControl: clamp(BASE_ATTRIBUTE_VALUE + (origin.statDeltas.groundControl ?? 0)),
    chin: clamp(BASE_ATTRIBUTE_VALUE + (origin.statDeltas.chin ?? 0)),
    cardio: clamp(BASE_ATTRIBUTE_VALUE + (origin.statDeltas.cardio ?? 0)),
    fightIQ: clamp(BASE_ATTRIBUTE_VALUE + (origin.statDeltas.fightIQ ?? 0)),
  };
}

// Pure: builds a schema-valid Fighter from an Origin.
//
// `face` is a parameter, not rolled here, matching nationality/weightClass:
// fighterFromOrigin stays free of RNG so it composes cleanly wherever it's
// called from. Loop 6.5 puts a real portrait editor in the amateur wrapper and
// the §9.3 skip path rolls one from its own seed; both are callers passing in an
// already-decided face, same as they already decide nationality today.
export function fighterFromOrigin(
  origin: Origin,
  id: string,
  name: string,
  nationality: string,
  weightClass: string,
  face: string,
): Fighter {
  return {
    id,
    name,
    nationality,
    face,
    weightClass,
    stance: 'orthodox',
    attributes: attributesFromOrigin(origin),
    archetype: origin.archetype,
    weakness: origin.weakness,
    traits: [],
    condition: { health: 100, injuries: [] },
  };
}
