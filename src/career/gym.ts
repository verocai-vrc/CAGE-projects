// gym.ts — Loop 7.8: where you train (DESIGN.md §16.8).
//
// This closes a hook that has been dangling since M4. `Origin.mentorGymId` is
// authored by the amateur wrapper, carried through `startCareer`, persisted —
// and read by nothing, because content/gyms.json was the two-character file
// `{}`. The wrapper's prose has been naming Ironside MMA and Apex Grappling to
// the player for two milestones with no gym behind either.
//
// §16.8's rule for this file is one line long: "a gym that does not touch camp
// does not ship." So all three effects land in camp resolution —
//
//   1. `specialty` multiplies training gains: specialtyMultiplier on the
//      attributes in its group, offSpecialtyMultiplier elsewhere.
//   2. `reputation / 100` REPLACES defaultTrainingPartnerQuality's flat 0.75 as
//      the ceiling on training-partner quality. The trainingPartners life bar
//      becomes a modulation of that ceiling rather than an absolute.
//   3. `dues` drain the purse weekly — the money pressure §8.3 promises under
//      "sponsors: gym dues unpaid" and which existed nowhere in the code.

import type { Attributes, RNG } from '../engine';
import { gymContent } from '../content';

export type GymSpecialty = 'striking' | 'grappling' | 'conditioning';

export interface Gym {
  id: string;
  name: string;
  city: string;
  country: string;
  specialty: GymSpecialty;
  reputation: number; // 0..100
  dues: number; // per week
}

/**
 * Which attributes each specialty trains hard.
 *
 * Deliberately the four §4.1 pillars collapsed into three: `conditioning`
 * covers what neither of the other two does, so every trained attribute belongs
 * to exactly one specialty and no gym is secretly better at everything. `chin`
 * and `fightIQ` appear nowhere because camp does not train them (see camp.ts's
 * TRAINING_ATTRIBUTES) — listing them here would imply a bias that cannot fire.
 */
export const SPECIALTY_ATTRIBUTES: Record<GymSpecialty, readonly (keyof Attributes)[]> = {
  striking: ['power', 'technique', 'speed'],
  grappling: ['wrestling', 'groundControl'],
  conditioning: ['cardio'],
};

const SPECIALTIES: readonly GymSpecialty[] = ['striking', 'grappling', 'conditioning'];

export interface GymBalance {
  specialtyMultiplier: number;
  offSpecialtyMultiplier: number;
  gymDuesBase: number;
}

/** The four ids the amateur wrapper can emit, as authored entries. */
export const ANCHOR_GYMS: readonly Gym[] = gymContent.anchors as readonly Gym[];

/**
 * Resolve a gym id to a gym. Never returns undefined for an anchor id, and
 * falls back to the neighbourhood gym for anything unrecognised — a career
 * whose gym id has drifted keeps training somewhere rather than crashing camp
 * (§11's fail-safe rule applied past persistence).
 */
export function gymById(id: string): Gym {
  return ANCHOR_GYMS.find((gym) => gym.id === id) ?? DEFAULT_GYM;
}

export const DEFAULT_GYM_ID = 'neighborhood-gym';
const DEFAULT_GYM: Gym =
  ANCHOR_GYMS.find((gym) => gym.id === DEFAULT_GYM_ID) ?? ANCHOR_GYMS[ANCHOR_GYMS.length - 1];

/**
 * A procedural gym for everywhere the player is not from (§16.8: "every other
 * gym is procedural from name parts").
 *
 * Exactly six draws on every path, so a caller's stream advances by a fixed
 * amount — the same discipline matchmaking.ts follows for weakness, record, and
 * nickname. `dues` scale with reputation because a better room costs more: that
 * is the whole decision a gym move poses in Loop 7.9.
 */
export function generateGym(rng: RNG, balance: GymBalance, idPrefix = 'gym'): Gym {
  const partA = gymContent.namePartsA[Math.floor(rng.next() * gymContent.namePartsA.length)];
  const partB = gymContent.namePartsB[Math.floor(rng.next() * gymContent.namePartsB.length)];
  const place = gymContent.cities[Math.floor(rng.next() * gymContent.cities.length)];
  const specialty = SPECIALTIES[Math.floor(rng.next() * SPECIALTIES.length)];
  const reputation = Math.round(30 + rng.next() * 65);
  const idSuffix = Math.floor(rng.next() * 1e9).toString(36);

  return {
    id: `${idPrefix}-${idSuffix}`,
    name: `${partA} ${partB}`,
    city: place.city,
    country: place.country,
    specialty,
    // A room with a reputation of 95 costs roughly twice the base; a 30 costs
    // roughly two-thirds of it.
    dues: Math.round(balance.gymDuesBase * (0.5 + reputation / 100)),
    reputation,
  };
}

/**
 * The multiplier this gym applies to one attribute's training gain.
 *
 * Note this is a bias, never a gate: an off-specialty attribute still improves,
 * just more slowly. A gym that stopped an attribute improving would make the
 * camp allocation screen lie about what the player is buying.
 */
export function specialtyMultiplierFor(
  specialty: GymSpecialty,
  attribute: keyof Attributes,
  balance: GymBalance,
): number {
  return SPECIALTY_ATTRIBUTES[specialty].includes(attribute)
    ? balance.specialtyMultiplier
    : balance.offSpecialtyMultiplier;
}

/**
 * §16.8 effect 2: the gym sets the CEILING on training-partner quality, and the
 * life bar modulates it.
 *
 * Before this, `trainingPartnerQuality` was `bars.trainingPartners / 100` alone
 * — a fighter with a full bar at a terrible gym trained as well as one at the
 * best room in the country. Multiplying the two makes the bar what §8.3 says it
 * is ("who you train with"), bounded by where you train.
 */
export function trainingPartnerCeiling(gym: Gym): number {
  return gym.reputation / 100;
}

/**
 * §16.8 effect 3: a week's dues, taken off the purse.
 *
 * Floors at 0 rather than going negative. A fighter who cannot make dues is a
 * real story, but debt is a system with its own rules (interest, collection,
 * a lose condition) and §12 caps scope hard — so for now the money simply runs
 * out, and the pressure is that everything else has to come from a purse that
 * is already empty.
 */
export function payGymDues(purse: number, gym: Gym): number {
  return Math.max(0, purse - gym.dues);
}
