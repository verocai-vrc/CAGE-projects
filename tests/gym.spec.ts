// Loop 7.8 — gym generation and camp bias (DESIGN.md §16.8).
//
// §16.8's test for whether a gym ships is one line: "a gym that does not touch
// camp does not ship." So these tests are mostly about camp resolution, not
// about the data — three effects, each measured against an identical camp week
// at a different gym.
//
// It also closes a hook dangling since M4: Origin.mentorGymId was authored by
// the amateur wrapper, carried through startCareer, persisted, and read by
// nothing, because content/gyms.json was the two-character file `{}`.

import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/engine/rng';
import type { Attributes, Fighter, Origin } from '../src/engine/types';
import { amateurMoments, balance, gymContent } from '../src/content';
import {
  ANCHOR_GYMS,
  DEFAULT_GYM_ID,
  GYM_MOVE_TRAINING_PARTNERS,
  SPECIALTY_ATTRIBUTES,
  acceptGymMove,
  generateGym,
  gymById,
  gymMoveCost,
  gymMoveOffer,
  payGymDues,
  resolveGym,
  specialtyMultiplierFor,
  trainingPartnerCeiling,
  type Gym,
  type GymMoveOffer,
} from '../src/career/gym';
import { resolveCampWeek } from '../src/career/camp';
import { startCareer } from '../src/career/progression';
import { GymSchema } from '../src/state/schema';
import { initialCareerState, type CareerState } from '../src/state/store';

function makeFighter(): Fighter {
  return {
    id: 'p1',
    name: 'Test Fighter',
    nickname: null,
    nationality: 'USA',
    face: '000000000000',
    weightClass: 'lightweight',
    stance: 'orthodox',
    attributes: {
      power: 50, technique: 50, speed: 50, wrestling: 50,
      groundControl: 50, chin: 50, cardio: 50, fightIQ: 50,
    },
    archetype: 'allrounder',
    weakness: null,
    record: { wins: 0, losses: 0, draws: 0, noContests: 0 },
    traits: [],
    condition: { health: 100, injuries: [] },
  };
}

const ALL_IN_TRAINING = { training: 10, weightManagement: 0, rest: 0, life: 0 };

/** One camp week at a given gym, from an identical fighter and allocation. */
function campAt(gym: Gym, trainingPartners = 1): Attributes {
  return resolveCampWeek(makeFighter(), ALL_IN_TRAINING, balance, {
    trainingPartnerQuality: trainingPartnerCeiling(gym) * trainingPartners,
    specialty: gym.specialty,
  }).fighter.attributes;
}

const striking = gymContent.anchors.find((g) => g.specialty === 'striking')! as Gym;

describe('effect 1: specialty biases training gains (§16.8)', () => {
  it('identical camps at a striking gym vs a grappling gym produce different spreads', () => {
    // Same fighter, same allocation, same reputation — only the specialty
    // differs, so any difference in the spread is the bias and nothing else.
    const evenReputation = { ...striking, reputation: 80 };
    const strikingWeek = campAt(evenReputation);
    const grapplingWeek = campAt({ ...evenReputation, specialty: 'grappling' });

    expect(strikingWeek.power).toBeGreaterThan(grapplingWeek.power);
    expect(strikingWeek.technique).toBeGreaterThan(grapplingWeek.technique);
    expect(grapplingWeek.wrestling).toBeGreaterThan(strikingWeek.wrestling);
    expect(grapplingWeek.groundControl).toBeGreaterThan(strikingWeek.groundControl);
  });

  it('a specialty is a bias, never a gate — off-specialty attributes still improve', () => {
    // A gym that stopped an attribute improving would make the camp allocation
    // screen lie about what the player is buying.
    const week = campAt({ ...striking, reputation: 100 });
    const base = makeFighter().attributes;
    expect(week.wrestling).toBeGreaterThan(base.wrestling);
    expect(week.groundControl).toBeGreaterThan(base.groundControl);
  });

  it('every trained attribute belongs to exactly one specialty', () => {
    // Otherwise some gym is secretly better at everything, or some attribute is
    // off-specialty everywhere and can never be trained well.
    const trained: (keyof Attributes)[] = [
      'power', 'technique', 'speed', 'wrestling', 'groundControl', 'cardio',
    ];
    for (const attribute of trained) {
      const owners = Object.values(SPECIALTY_ATTRIBUTES).filter((group) => group.includes(attribute));
      expect(owners, `'${attribute}' is owned by ${owners.length} specialties`).toHaveLength(1);
    }
  });

  it('the multipliers come from balance.json, on the specialty group', () => {
    expect(specialtyMultiplierFor('striking', 'power', balance)).toBe(balance.specialtyMultiplier);
    expect(specialtyMultiplierFor('striking', 'wrestling', balance)).toBe(balance.offSpecialtyMultiplier);
    expect(balance.specialtyMultiplier).toBeGreaterThan(balance.offSpecialtyMultiplier);
  });

  it('omitting the specialty leaves an unbiased week — every attribute at the flat rate', () => {
    const unbiased = resolveCampWeek(makeFighter(), ALL_IN_TRAINING, balance, {
      trainingPartnerQuality: 1,
    }).fighter.attributes;
    expect(unbiased.power).toBe(unbiased.wrestling);
    expect(unbiased.power).toBe(unbiased.cardio);
  });
});

describe('effect 2: reputation is the ceiling on training-partner quality (§16.8)', () => {
  it('reputation 100 vs 40 changes gains at identical trainingPartners', () => {
    const good = campAt({ ...striking, reputation: 100 }, 1);
    const poor = campAt({ ...striking, reputation: 40 }, 1);
    expect(good.power).toBeGreaterThan(poor.power);
  });

  it('the life bar modulates the ceiling rather than replacing it', () => {
    // Before §16.8, quality was the bar alone: a full bar at a terrible gym
    // trained as well as one at the best room in the country. It must not.
    const fullBarBadGym = campAt({ ...striking, reputation: 40 }, 1);
    const halfBarGoodGym = campAt({ ...striking, reputation: 100 }, 0.5);
    expect(trainingPartnerCeiling({ ...striking, reputation: 40 })).toBeCloseTo(0.4);
    expect(fullBarBadGym.power).toBeLessThan(halfBarGoodGym.power);
  });

  it('a neglected bar still costs gains at a great gym', () => {
    const fed = campAt({ ...striking, reputation: 90 }, 1);
    const neglected = campAt({ ...striking, reputation: 90 }, 0.2);
    expect(neglected.power).toBeLessThan(fed.power);
  });
});

describe('effect 3: dues drain the purse weekly (§16.8)', () => {
  it('a week at the gym costs its dues', () => {
    expect(payGymDues(1000, { ...striking, dues: 145 })).toBe(855);
  });

  it('a broke fighter floors at 0 rather than going negative', () => {
    expect(payGymDues(50, { ...striking, dues: 145 })).toBe(0);
    expect(payGymDues(0, { ...striking, dues: 145 })).toBe(0);
  });

  it('drains week on week', () => {
    let purse = 500;
    const gym = { ...striking, dues: 145 };
    for (let week = 0; week < 5; week++) purse = payGymDues(purse, gym);
    expect(purse).toBe(0);
  });

  it('a better room costs more — dues scale with reputation on generated gyms', () => {
    const gyms = Array.from({ length: 200 }, (_, i) => generateGym(mulberry32(i), balance));
    const best = gyms.reduce((a, b) => (a.reputation > b.reputation ? a : b));
    const worst = gyms.reduce((a, b) => (a.reputation < b.reputation ? a : b));
    expect(best.dues).toBeGreaterThan(worst.dues);
  });
});

describe('the mentor gym hook, finally read (§16.8)', () => {
  it('every mentorGymId the amateur wrapper can emit resolves to a real gym', () => {
    const emitted = new Set<string>([DEFAULT_GYM_ID]);
    for (const moment of amateurMoments) {
      for (const option of moment.options) {
        if (option.mentorGymId) emitted.add(option.mentorGymId);
      }
    }
    // All four, including the neighborhood-gym fallback.
    expect(emitted.size).toBe(4);
    for (const id of emitted) {
      expect(ANCHOR_GYMS.some((gym) => gym.id === id), `no gym entry for '${id}'`).toBe(true);
    }
  });

  it('startCareer puts the player at their mentor gym', () => {
    const origin: Origin = {
      statDeltas: {},
      archetype: 'striker',
      weakness: null,
      mentorGymId: 'golden-gate-boxing',
      hypeModifier: 0,
      amateurRecord: { wins: 4, losses: 1 },
    };
    expect(startCareer(origin, 'SEED', 'p1', 'X').gymId).toBe('golden-gate-boxing');
  });

  it('an unrecognised id falls back rather than breaking camp', () => {
    expect(gymById('a-gym-that-was-deleted').id).toBe(DEFAULT_GYM_ID);
    expect(gymById('').id).toBe(DEFAULT_GYM_ID);
  });

  it('the anchors are the gyms the wrapper prose names', () => {
    // The wrapper has been describing Ironside and Apex to the player since M4.
    // These entries have to be those gyms, not coincidental ids.
    expect(gymById('ironside-mma').name).toBe('Ironside MMA');
    expect(gymById('ironside-mma').specialty).toBe('grappling'); // "grinders and wrestlers"
    expect(gymById('golden-gate-boxing').specialty).toBe('striking'); // "a striking pedigree"
    expect(gymById('apex-grappling').specialty).toBe('grappling'); // "a jiu-jitsu factory"
    // And the fallback is the worst room of the four, because it is where you
    // end up having chosen nothing.
    const others = ANCHOR_GYMS.filter((g) => g.id !== DEFAULT_GYM_ID);
    for (const gym of others) {
      expect(gymById(DEFAULT_GYM_ID).reputation).toBeLessThan(gym.reputation);
      expect(gymById(DEFAULT_GYM_ID).dues).toBeLessThan(gym.dues);
    }
  });
});

describe('procedural gyms', () => {
  it('are schema-valid and deterministic', () => {
    for (let seed = 0; seed < 100; seed++) {
      const gym = generateGym(mulberry32(seed), balance);
      expect(GymSchema.safeParse(gym).success).toBe(true);
      expect(generateGym(mulberry32(seed), balance)).toEqual(gym);
    }
  });

  it('cover all three specialties and vary in name and reputation', () => {
    const gyms = Array.from({ length: 200 }, (_, i) => generateGym(mulberry32(i), balance));
    expect(new Set(gyms.map((g) => g.specialty)).size).toBe(3);
    expect(new Set(gyms.map((g) => g.name)).size).toBeGreaterThan(20);
    expect(new Set(gyms.map((g) => g.reputation)).size).toBeGreaterThan(20);
  });

  it('consume a fixed number of draws, so a later draw cannot depend on the gym', () => {
    const drawsUsed = (seed: number) => {
      const rng = mulberry32(seed);
      let count = 0;
      generateGym({ next: () => { count++; return rng.next(); } }, balance);
      return count;
    };
    expect(new Set(Array.from({ length: 100 }, (_, i) => drawsUsed(i))).size).toBe(1);
  });

  it('never collide in id across a career-sized sample', () => {
    const ids = Array.from({ length: 300 }, (_, i) => generateGym(mulberry32(i), balance).id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// Loop 7.9 — the gym move (§16.8)
//
// "Gyms can be changed, or `specialty` is a dice roll wearing a mechanic's
// coat." Without the move, the gym the amateur wrapper handed the player in
// week 0 decides which attributes train well for an entire career, off the back
// of a prose choice about a mentor.
// ---------------------------------------------------------------------------

/** A career mid-run, at an anchor gym, with money in the bank. */
function careerAt(gymId: string, purse: number): CareerState {
  return {
    ...initialCareerState,
    seed: 'MOVESEED',
    gymId,
    purse,
    week: 12,
    lifeBars: { ...initialCareerState.lifeBars, trainingPartners: 90 },
  };
}

/** The first offer a stream actually produces, for tests about what a move
 *  does rather than about how often one appears. */
function anOffer(): GymMoveOffer {
  for (let seed = 0; seed < 200; seed++) {
    const offer = gymMoveOffer(mulberry32(seed), balance);
    if (offer) return offer;
  }
  throw new Error('no gym move offer in 200 seeds — check gymMoveOfferChance');
}

describe('the gym move offer (§16.8)', () => {
  it('is deterministic — the same seed gives the same offer', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(gymMoveOffer(mulberry32(seed), balance)).toEqual(gymMoveOffer(mulberry32(seed), balance));
    }
  });

  it('sometimes offers nothing, and sometimes offers something', () => {
    // A move offered every single week is not an offer, it is a menu item.
    const offers = Array.from({ length: 300 }, (_, i) => gymMoveOffer(mulberry32(i), balance));
    const made = offers.filter((o) => o !== null);
    expect(made.length).toBeGreaterThan(0);
    expect(made.length).toBeLessThan(offers.length);
  });

  it('consumes a fixed number of draws whether or not an offer is made', () => {
    // Otherwise "no offer this week" would shift every later career draw, and
    // the seed would stop reproducing the career (§16.2).
    const drawsUsed = (seed: number) => {
      const rng = mulberry32(seed);
      let count = 0;
      gymMoveOffer({ next: () => { count++; return rng.next(); } }, balance);
      return count;
    };
    const counts = Array.from({ length: 200 }, (_, i) => drawsUsed(i));
    expect(new Set(counts).size).toBe(1);
  });

  it('comes with a room and the man who runs it', () => {
    const offer = anOffer();
    expect(GymSchema.safeParse(offer.gym).success).toBe(true);
    expect(offer.coach.name).toMatch(/\S+ \S+/);
    expect(offer.cost).toBeGreaterThan(0);
  });

  it('prices a better room higher', () => {
    // The good room is expensive twice — once to walk in, and every week after.
    const cheap = gymMoveCost({ ...striking, reputation: 30 }, balance);
    const dear = gymMoveCost({ ...striking, reputation: 95 }, balance);
    expect(dear).toBeGreaterThan(cheap);
  });
});

describe('accepting a gym move (§16.8)', () => {
  it('changes the gym, debits the purse, and resets the bar', () => {
    const offer = anOffer();
    const before = careerAt('neighborhood-gym', offer.cost + 5000);
    const result = acceptGymMove(before, offer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.career.gymId).toBe(offer.gym.id);
    expect(result.career.purse).toBe(before.purse - offer.cost);
    expect(result.career.lifeBars.trainingPartners).toBe(GYM_MOVE_TRAINING_PARTNERS);
  });

  it('changes the corner too — the coach belongs to the room', () => {
    const offer = anOffer();
    const result = acceptGymMove(careerAt('neighborhood-gym', 99999), offer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.career.coach).toEqual(offer.coach);
  });

  it('is pure — the career handed in is not mutated', () => {
    const offer = anOffer();
    const before = careerAt('neighborhood-gym', 99999);
    const snapshot = structuredClone(before);
    acceptGymMove(before, offer);
    expect(before).toEqual(snapshot);
  });

  it('the next camp week resolves against the new specialty', () => {
    // This is the whole point of the loop: the move has to reach camp, or the
    // player paid money to change a label.
    const offer = anOffer();
    const moved = acceptGymMove(careerAt('neighborhood-gym', 99999), offer);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    const gym = resolveGym(moved.career);
    expect(gym.id).toBe(offer.gym.id);
    expect(gym.specialty).toBe(offer.gym.specialty);

    // And the bias the new specialty implies is the one camp actually applies.
    const week = campAt(gym);
    const specialtyAttrs = SPECIALTY_ATTRIBUTES[gym.specialty];
    const base = makeFighter().attributes;
    for (const attribute of specialtyAttrs) {
      expect(week[attribute]).toBeGreaterThan(base[attribute]);
    }
  });

  it('a moved-to gym survives being stored on the career', () => {
    // A procedural gym exists in no content file, so gymById cannot find it —
    // resolveGym must read it off the career or camp silently falls back to the
    // neighbourhood gym and the move is undone.
    const offer = anOffer();
    const moved = acceptGymMove(careerAt('neighborhood-gym', 99999), offer);
    if (!moved.ok) throw new Error('expected the move to be accepted');
    expect(gymById(offer.gym.id).id).toBe(DEFAULT_GYM_ID); // not in content
    expect(resolveGym(moved.career).id).toBe(offer.gym.id); // but resolved anyway
  });

  it('anchor gyms still resolve from the id alone', () => {
    expect(resolveGym({ gymId: 'ironside-mma', currentGym: null }).name).toBe('Ironside MMA');
  });
});

describe('a move that cannot be taken surfaces a reason (§16.8)', () => {
  it('refuses when the player cannot afford it', () => {
    // "A reason surfaced rather than a dead button" — a disabled control with
    // no explanation is the failure mode this exists to prevent.
    const offer = anOffer();
    const result = acceptGymMove(careerAt('neighborhood-gym', offer.cost - 1), offer);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('insufficient-funds');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('a refused move changes nothing', () => {
    const offer = anOffer();
    const before = careerAt('neighborhood-gym', 0);
    const result = acceptGymMove(before, offer);
    expect(result.ok).toBe(false);
    expect(before.gymId).toBe('neighborhood-gym');
    expect(before.purse).toBe(0);
    expect(before.lifeBars.trainingPartners).toBe(90);
  });

  it('affording it exactly is enough', () => {
    // An off-by-one here would read as "the game lied about the price".
    const offer = anOffer();
    expect(acceptGymMove(careerAt('neighborhood-gym', offer.cost), offer).ok).toBe(true);
  });

  it('refuses a move to the gym the player is already at', () => {
    const offer = anOffer();
    const already = { ...careerAt(offer.gym.id, 99999), currentGym: offer.gym };
    const result = acceptGymMove(already, offer);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('already-there');
  });
});
