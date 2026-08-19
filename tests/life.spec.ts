import { describe, expect, it } from 'vitest';
import {
  campFocusMultiplier,
  initialLifeBars,
  resolveLifeWeek,
  sponsorPurseMultiplier,
  trainingPartnerQuality,
  type LifeBalance,
  type LifeBars,
} from '../src/career/life';
import { resolveCampWeek, type CampBalance } from '../src/career/camp';
import { offerQuality, type MatchmakingBalance } from '../src/career/matchmaking';
import type { Fighter } from '../src/engine/types';

const lifeBalance: LifeBalance = {
  weeklyDecay: { partner: 4, hype: 3, sponsor: 3, trainingPartners: 5 },
  lifeGainPerEnergy: 2.5,
};

const campBalance: CampBalance = {
  weeklyEnergyBudget: 10,
  trainingGainPerEnergy: 0.4,
  restRegenPerEnergy: 1.5,
  defaultTrainingPartnerQuality: 0.75,
};

const matchBalance: MatchmakingBalance = {
  baseOfferPurse: 5000,
  offerPursePerRankingPoint: 400,
  offerPursePerHype: 50,
  baseHypeReward: 5,
};

function makeFighter(): Fighter {
  return {
    id: 'f1',
    name: 'Test Fighter',
    nationality: 'fixture',
    face: '000000000',
    weightClass: 'lightweight',
    stance: 'orthodox',
    attributes: {
      power: 50,
      technique: 50,
      speed: 50,
      wrestling: 50,
      groundControl: 50,
      chin: 50,
      cardio: 50,
      fightIQ: 50,
    },
    archetype: 'allrounder',
    weakness: null,
    record: { wins: 0, losses: 0, draws: 0, noContests: 0 },
    traits: [],
    condition: { health: 70, injuries: [] },
  };
}

describe('resolveLifeWeek', () => {
  it('decays every bar and hype by the configured weekly amount when unfed', () => {
    const { bars, hype } = resolveLifeWeek(initialLifeBars, 100, 0, lifeBalance);
    expect(bars.trainingPartners).toBe(100 - lifeBalance.weeklyDecay.trainingPartners);
    expect(bars.partner).toBe(100 - lifeBalance.weeklyDecay.partner);
    expect(bars.sponsors).toBe(100 - lifeBalance.weeklyDecay.sponsor);
    expect(hype).toBe(100 - lifeBalance.weeklyDecay.hype);
  });

  it('clamps decay at 0, never negative', () => {
    const depleted: LifeBars = { trainingPartners: 1, partner: 1, sponsors: 1 };
    const { bars, hype } = resolveLifeWeek(depleted, 1, 0, lifeBalance);
    expect(bars.trainingPartners).toBe(0);
    expect(bars.partner).toBe(0);
    expect(bars.sponsors).toBe(0);
    expect(hype).toBe(0);
  });

  it('life energy feeds the three bars evenly and offsets decay, but never feeds hype', () => {
    const { bars, hype } = resolveLifeWeek(initialLifeBars, 50, 10, lifeBalance);
    // gain per bar = 10 * 2.5 / 3 ≈ 8.33, comfortably more than any single
    // bar's weekly decay, so a well-fed week nets a gain (clamped at 100).
    expect(bars.trainingPartners).toBe(100);
    expect(bars.partner).toBe(100);
    expect(bars.sponsors).toBe(100);
    // hype has no feed channel — it only decays here, fighting is what grows it.
    expect(hype).toBe(50 - lifeBalance.weeklyDecay.hype);
  });

  it('clamps a gain at 100, never over', () => {
    const { bars } = resolveLifeWeek(initialLifeBars, 100, 100, lifeBalance);
    expect(bars.trainingPartners).toBeLessThanOrEqual(100);
    expect(bars.partner).toBeLessThanOrEqual(100);
    expect(bars.sponsors).toBeLessThanOrEqual(100);
  });
});

describe('derived multipliers', () => {
  it('trainingPartnerQuality and campFocusMultiplier are 1 at full bars, 0 at empty', () => {
    expect(trainingPartnerQuality(initialLifeBars)).toBe(1);
    expect(campFocusMultiplier(initialLifeBars)).toBe(1);
    const empty: LifeBars = { trainingPartners: 0, partner: 0, sponsors: 0 };
    expect(trainingPartnerQuality(empty)).toBe(0);
    expect(campFocusMultiplier(empty)).toBe(0);
  });

  it('sponsorPurseMultiplier is floored at 0.5, never fully zeroes a purse', () => {
    const empty: LifeBars = { trainingPartners: 0, partner: 0, sponsors: 0 };
    expect(sponsorPurseMultiplier(initialLifeBars)).toBe(1);
    expect(sponsorPurseMultiplier(empty)).toBe(0.5);
  });
});

describe('neglect vs. fed — the measurable tension (Loop 4.1 exit gate)', () => {
  const WEEKS = 8;

  function simulateWeeks(lifeEnergyPerWeek: number): LifeBars {
    let bars = initialLifeBars;
    let hype = 50;
    for (let i = 0; i < WEEKS; i++) {
      ({ bars, hype } = resolveLifeWeek(bars, hype, lifeEnergyPerWeek, lifeBalance));
    }
    return bars;
  }

  it('camp gains are measurably worse after weeks of neglect than for a fed fighter', () => {
    const neglectedBars = simulateWeeks(0);
    const fedBars = simulateWeeks(10);
    expect(trainingPartnerQuality(neglectedBars)).toBeLessThan(trainingPartnerQuality(fedBars));

    const fighter = makeFighter();
    const allocation = { training: 10, weightManagement: 0, rest: 0 };
    const neglectedResult = resolveCampWeek(
      fighter,
      allocation,
      campBalance,
      trainingPartnerQuality(neglectedBars),
      campFocusMultiplier(neglectedBars),
    );
    const fedResult = resolveCampWeek(
      fighter,
      allocation,
      campBalance,
      trainingPartnerQuality(fedBars),
      campFocusMultiplier(fedBars),
    );

    expect(neglectedResult.fighter.attributes.power).toBeLessThan(fedResult.fighter.attributes.power);
  });

  it('matchmaking offers are measurably worse after weeks of sponsor neglect than for a fed fighter', () => {
    const neglectedBars = simulateWeeks(0);
    const fedBars = simulateWeeks(10);

    const neglectedOffer = offerQuality(10, 50, matchBalance, sponsorPurseMultiplier(neglectedBars));
    const fedOffer = offerQuality(10, 50, matchBalance, sponsorPurseMultiplier(fedBars));

    expect(neglectedOffer.purse).toBeLessThan(fedOffer.purse);
  });

  it('rest regen is measurably worse after weeks of a neglected partner bar', () => {
    const neglectedBars = simulateWeeks(0);
    const fedBars = simulateWeeks(10);

    const fighter = makeFighter();
    const allocation = { training: 0, weightManagement: 0, rest: 10 };
    const neglectedResult = resolveCampWeek(
      fighter,
      allocation,
      campBalance,
      trainingPartnerQuality(neglectedBars),
      campFocusMultiplier(neglectedBars),
    );
    const fedResult = resolveCampWeek(
      fighter,
      allocation,
      campBalance,
      trainingPartnerQuality(fedBars),
      campFocusMultiplier(fedBars),
    );

    expect(neglectedResult.fighter.condition.health).toBeLessThan(fedResult.fighter.condition.health);
  });
});
