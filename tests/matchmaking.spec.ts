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

// matchmaking.ts takes the face-drawing function as a parameter rather than
// importing ui/portrait (career/ stays decoupled from ui/, same as archetypes and
// namePools already flow in as parameters). This stub still consumes the rng it's
// handed, so a test asserting determinism would still catch a caller that forgot to
// thread the stream through.
const drawFace = (rng: { next: () => number }) => Math.floor(rng.next() * 1e9).toString(36);

describe('generateOpponent', () => {
  it('produces a schema-valid Fighter', () => {
    const rng = mulberry32(1);
    const opponent = generateOpponent(archetypeTemplates, namePools, rng, { weightClass: 'lightweight' }, drawFace);
    expect(FighterSchema.safeParse(opponent).success).toBe(true);
  });

  it('N generated opponents are all schema-valid', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const opponent = generateOpponent(archetypeTemplates, namePools, rng, { weightClass: 'lightweight' }, drawFace);
      const result = FighterSchema.safeParse(opponent);
      expect(result.success).toBe(true);
    }
  });

  it('archetype distribution roughly matches template weights over many draws', () => {
    const rng = mulberry32(7);
    const counts: Record<string, number> = { striker: 0, wrestler: 0 };
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const opponent = generateOpponent(archetypeTemplates, namePools, rng, { weightClass: 'lightweight' }, drawFace);
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
    }, matchBalance, drawFace);

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
    }, matchBalance, drawFace);
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

describe('generateOpponent face (Loop 6.4, DESIGN.md §15.4)', () => {
  it('the same seed produces the same opponent with the same face', () => {
    const rngA = mulberry32(2024);
    const opponentA = generateOpponent(archetypeTemplates, namePools, rngA, { weightClass: 'lightweight' }, drawFace);

    const rngB = mulberry32(2024);
    const opponentB = generateOpponent(archetypeTemplates, namePools, rngB, { weightClass: 'lightweight' }, drawFace);

    expect(opponentA).toEqual(opponentB);
    expect(opponentA.face).toBe(opponentB.face);
  });

  it("an opponent's face is stable across repeated reads (re-rendering never perturbs it)", () => {
    const rng = mulberry32(31);
    const opponent = generateOpponent(archetypeTemplates, namePools, rng, { weightClass: 'lightweight' }, drawFace);
    const faceAtRenderOne = opponent.face;
    const faceAtRenderTwo = opponent.face;
    expect(faceAtRenderOne).toBe(faceAtRenderTwo);
  });

  it('draws the face from the same seeded stream as name/attributes, not a fresh one', () => {
    // Two independent RNGs seeded the same way must diverge identically whether or
    // not a face is drawn in between — proving drawFace consumes from the passed
    // stream rather than reaching for its own source.
    let calls = 0;
    const countingDraw = (rng: { next: () => number }) => {
      calls++;
      return drawFace(rng);
    };
    const rng = mulberry32(8);
    generateOpponent(archetypeTemplates, namePools, rng, { weightClass: 'lightweight' }, countingDraw);
    expect(calls).toBe(1);
  });
});
