import { describe, expect, it } from 'vitest';
import {
  generateMatchSlate,
  generateOpponent,
  offerQuality,
  type ArchetypeTemplate,
  type MatchmakingBalance,
  type NamePool,
} from '../src/career/matchmaking';
import { mulberry32 } from '../src/engine/rng';
import { FighterSchema } from '../src/state/schema';

const archetypeTemplates: ArchetypeTemplate[] = [
  {
    id: 'striker',
    weight: 1,
    attributes: {
      power: 48,
      technique: 78,
      speed: 68,
      wrestling: 24,
      groundControl: 22,
      chin: 72,
      cardio: 56,
      fightIQ: 72,
    },
  },
  {
    id: 'wrestler',
    weight: 3,
    attributes: {
      power: 38,
      technique: 30,
      speed: 38,
      wrestling: 82,
      groundControl: 78,
      chin: 68,
      cardio: 56,
      fightIQ: 44,
    },
  },
];

const namePools: NamePool[] = [
  { nationality: 'USA', weight: 1, firstNames: ['Marcus', 'Jake'], lastNames: ['Cole', 'Whitfield'] },
  { nationality: 'Brazil', weight: 1, firstNames: ['Rafael', 'Thiago'], lastNames: ['Silva', 'Souza'] },
];

const matchBalance: MatchmakingBalance = {
  baseOfferPurse: 5000,
  offerPursePerRankingPoint: 400,
  offerPursePerHype: 50,
  baseHypeReward: 5,
};

describe('generateOpponent', () => {
  it('produces a schema-valid Fighter', () => {
    const rng = mulberry32(1);
    const opponent = generateOpponent(archetypeTemplates, namePools, rng, { weightClass: 'lightweight' });
    expect(FighterSchema.safeParse(opponent).success).toBe(true);
  });

  it('N generated opponents are all schema-valid', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const opponent = generateOpponent(archetypeTemplates, namePools, rng, { weightClass: 'lightweight' });
      const result = FighterSchema.safeParse(opponent);
      expect(result.success).toBe(true);
    }
  });

  it('archetype distribution roughly matches template weights over many draws', () => {
    const rng = mulberry32(7);
    const counts: Record<string, number> = { striker: 0, wrestler: 0 };
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const opponent = generateOpponent(archetypeTemplates, namePools, rng, { weightClass: 'lightweight' });
      counts[opponent.archetype]++;
    }
    // weights are 1:3 (striker:wrestler) => expect roughly 25%/75%
    const strikerRate = counts.striker / N;
    expect(strikerRate).toBeGreaterThan(0.18);
    expect(strikerRate).toBeLessThan(0.32);
  });
});

describe('generateMatchSlate', () => {
  it('generates N distinct-named opponents at reasonable N', () => {
    const rng = mulberry32(99);
    const slate = generateMatchSlate(archetypeTemplates, namePools, rng, 4, {
      weightClass: 'lightweight',
      ranking: 10,
      hype: 20,
    }, matchBalance);

    expect(slate.length).toBe(4);
    const names = slate.map((offer) => offer.opponent.name);
    expect(new Set(names).size).toBe(names.length);
    for (const offer of slate) {
      expect(FighterSchema.safeParse(offer.opponent).success).toBe(true);
    }
  });

  it('every offer in a slate carries the same offer quality (ranking/hype are slate-wide, not per-opponent)', () => {
    const rng = mulberry32(123);
    const slate = generateMatchSlate(archetypeTemplates, namePools, rng, 3, {
      weightClass: 'lightweight',
      ranking: 5,
      hype: 50,
    }, matchBalance);
    const purses = new Set(slate.map((offer) => offer.purse));
    expect(purses.size).toBe(1);
  });
});

describe('offerQuality', () => {
  it('better ranking (lower number) and higher hype produce a bigger purse', () => {
    const worse = offerQuality(25, 0, matchBalance);
    const better = offerQuality(2, 0, matchBalance);
    expect(better.purse).toBeGreaterThan(worse.purse);

    const lowHype = offerQuality(10, 0, matchBalance);
    const highHype = offerQuality(10, 100, matchBalance);
    expect(highHype.purse).toBeGreaterThan(lowHype.purse);
  });

  it('unranked (null) fighters get the offer floor, never a negative purse', () => {
    const unranked = offerQuality(null, 0, matchBalance);
    expect(unranked.purse).toBeGreaterThanOrEqual(0);
    expect(unranked.purse).toBe(matchBalance.baseOfferPurse);
  });
});
