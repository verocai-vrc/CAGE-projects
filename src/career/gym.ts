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
import { generateCoach, type Coach } from './coach';
import type { CareerState } from '../state/store';

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

/** Loop 7.9: the extra knobs the move needs, kept separate so camp.ts's
 *  CampBalance does not have to carry constants camp never reads. */
export interface GymMoveBalance extends GymBalance {
  gymMoveCostBase: number;
  gymMoveOfferChance: number;
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

// ---------------------------------------------------------------------------
// Loop 7.9 — the gym move (§16.8)
//
// "Gyms can be changed, or `specialty` is a dice roll wearing a mechanic's
// coat." Without a move, the gym the amateur wrapper handed the player in week
// 0 decides which attributes train well for the entire career, and the player
// never makes that choice — they made a prose choice about a mentor six weeks
// of game-time earlier, and a bias fell out of it.
//
// The move is offered after a fight because that is when a fighter has both the
// money and the standing to be recruited, and it is the one moment the career
// loop already stops to show the player a screen.
// ---------------------------------------------------------------------------

/**
 * What is on the table: a room, the man who runs it, and the up-front price.
 *
 * The coach travels with the gym rather than being independent state, because a
 * coach who followed the player between gyms would be a corner with no
 * connection to the room it stands in — and `coach` would then be rolled once at
 * career start and never change again, which is exactly the inert state §16.8
 * rejects elsewhere ("a gym that does not touch camp does not ship"). It also
 * makes the move a real trade: the better room may come with a worse corner.
 */
export interface GymMoveOffer {
  gym: Gym;
  coach: Coach;
  /** Up-front, on top of the new gym's weekly dues. */
  cost: number;
}

/** §16.8: a move "resets `trainingPartners` to 50". Flat, in both directions —
 *  the player is the new face in the room whether they left a great gym or a
 *  neglected one. A move therefore repairs a badly-decayed bar, and the fee is
 *  what prices that; the alternative (only ever lowering it) would make the
 *  move strictly punishing and nobody would take it. */
export const GYM_MOVE_TRAINING_PARTNERS = 50;

/**
 * The offer made after a fight, or `null` for the weeks nobody comes calling.
 *
 * Exactly one draw more than the generators it calls on every path, including
 * the `null` one, so the caller's stream advances by a fixed amount — the same
 * discipline nicknameFor follows. The chance is rolled first and the gym and
 * coach are generated unconditionally, then discarded if the roll failed.
 */
export function gymMoveOffer(rng: RNG, balance: GymMoveBalance): GymMoveOffer | null {
  const offered = rng.next() < balance.gymMoveOfferChance;
  const gym = generateGym(rng, balance);
  const coach = generateCoach(rng);

  if (!offered) return null;
  return { gym, coach, cost: gymMoveCost(gym, balance) };
}

/**
 * What joining this room costs up front.
 *
 * Scales with reputation on the same curve as dues (gym.ts's generateGym), so
 * the good room is expensive twice — once to walk in, and every week after.
 * That is the decision: a cheap gym now, or a better one you have to keep
 * affording.
 */
export function gymMoveCost(gym: Gym, balance: GymMoveBalance): number {
  return Math.round(balance.gymMoveCostBase * (0.5 + gym.reputation / 100));
}

/**
 * Why a move could not be taken. A code rather than a sentence so the caller
 * decides the wording and the tests assert on the rule — §16.8 asks for "a
 * reason surfaced rather than a dead button", and a button that is disabled with
 * no explanation is the failure mode this exists to prevent.
 */
export type GymMoveRefusal = 'insufficient-funds' | 'already-there';

export type GymMoveResult =
  | { ok: true; career: CareerState }
  | { ok: false; reason: GymMoveRefusal; message: string };

const REFUSAL_MESSAGES: Record<GymMoveRefusal, string> = {
  'insufficient-funds': "You can't cover the sign-on fee.",
  'already-there': "You already train there.",
};

function refuse(reason: GymMoveRefusal): GymMoveResult {
  return { ok: false, reason, message: REFUSAL_MESSAGES[reason] };
}

/**
 * Take the offer: change gyms, change corners, pay for it.
 *
 * Pure — returns the next CareerState and never mutates. The three effects
 * §16.8 names all land here, and the fourth (the specialty biasing camp) falls
 * out of `gymId` changing, because camp.ts already resolves the gym from it
 * every week.
 *
 * The new gym is not added to any registry: `gymById` only resolves anchors, and
 * a career whose gym id it cannot resolve falls back to the neighbourhood gym.
 * So the moved-to gym is stored on the career itself rather than looked up —
 * see `resolveGym`, which is what camp must call from here on.
 */
export function acceptGymMove(career: CareerState, offer: GymMoveOffer): GymMoveResult {
  if (career.gymId === offer.gym.id) return refuse('already-there');
  if (career.purse < offer.cost) return refuse('insufficient-funds');

  return {
    ok: true,
    career: {
      ...career,
      gymId: offer.gym.id,
      currentGym: offer.gym,
      coach: offer.coach,
      purse: career.purse - offer.cost,
      lifeBars: { ...career.lifeBars, trainingPartners: GYM_MOVE_TRAINING_PARTNERS },
    },
  };
}

/**
 * The gym a career is actually training at.
 *
 * `gymById` alone cannot answer this any more: after a move the player trains at
 * a procedural gym that exists in no content file, so the gym travels on the
 * career as `currentGym`. Anchors stay resolvable by id (a save carrying only
 * `gymId: 'ironside-mma'` still works), and the fallback behaviour is unchanged.
 */
export function resolveGym(career: Pick<CareerState, 'gymId' | 'currentGym'>): Gym {
  if (career.currentGym && career.currentGym.id === career.gymId) return career.currentGym;
  return gymById(career.gymId);
}
