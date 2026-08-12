import { describe, expect, it } from 'vitest';
import { decideFight, scoreFight, type RoundTape } from '../src/engine/judging';
import { mulberry32 } from '../src/engine/rng';
import { balance, judges } from '../src/content';

// Deliberately near-dead-even: raw round diffs are small enough that each
// judge's noise term can flip a round either way, which is what "no clear
// edge" needs to actually exercise the split/unanimous mix below.
const closeTape: RoundTape[] = [
  {
    round: 1,
    strikesLandedA: 18,
    strikesLandedB: 18,
    controlTimeA: 45,
    controlTimeB: 44,
    knockdownsA: 0,
    knockdownsB: 0,
    submissionThreatsA: 0,
    submissionThreatsB: 0,
  },
  {
    round: 2,
    strikesLandedA: 19,
    strikesLandedB: 19,
    controlTimeA: 44,
    controlTimeB: 45,
    knockdownsA: 0,
    knockdownsB: 0,
    submissionThreatsA: 0,
    submissionThreatsB: 0,
  },
  {
    round: 3,
    strikesLandedA: 18,
    strikesLandedB: 17,
    controlTimeA: 45,
    controlTimeB: 45,
    knockdownsA: 0,
    knockdownsB: 0,
    submissionThreatsA: 0,
    submissionThreatsB: 0,
  },
];

// A single round with a moderate control-time edge for A and otherwise even
// strikes/knockdowns/submissions. Sized so a grappling-blind judge (low
// control weight) scores it a normal round while a control-aware judge
// (high control weight) scores it dominant — independent of noise, since
// the weighted gap sits far from both judges' noise range.
const controlHeavyRoundTape: RoundTape[] = [
  {
    round: 1,
    strikesLandedA: 15,
    strikesLandedB: 15,
    controlTimeA: 70,
    controlTimeB: 20,
    knockdownsA: 0,
    knockdownsB: 0,
    submissionThreatsA: 0,
    submissionThreatsB: 0,
  },
];

describe('scoreFight', () => {
  it('different judge bias vectors produce different scorecards for the identical tape', () => {
    const oyelaran = judges.find((j) => j.id === 'oyelaran')!;
    const park = judges.find((j) => j.id === 'park')!;
    const grapplingBlindCard = scoreFight(controlHeavyRoundTape, oyelaran, balance, mulberry32(1));
    const controlAwareCard = scoreFight(controlHeavyRoundTape, park, balance, mulberry32(1));
    expect(grapplingBlindCard.roundScores).not.toEqual(controlAwareCard.roundScores);
  });

  it('is deterministic for a fixed judge, tape, and seed', () => {
    const judge = judges[0];
    const cardA = scoreFight(closeTape, judge, balance, mulberry32(99));
    const cardB = scoreFight(closeTape, judge, balance, mulberry32(99));
    expect(cardA).toEqual(cardB);
  });
});

describe('decideFight', () => {
  it('produces a plausible split-decision rate for a close fight with no clear edge, over many seeded runs', () => {
    const N = 500;
    let splitCount = 0;
    let unanimousCount = 0;

    for (let i = 0; i < N; i++) {
      const rng = mulberry32(10_000 + i);
      const scorecards = judges.map((judge) => scoreFight(closeTape, judge, balance, rng));
      const { method } = decideFight(scorecards);
      if (method === 'SD') splitCount++;
      if (method === 'UD') unanimousCount++;
    }

    const splitRate = splitCount / N;
    expect(splitRate).toBeGreaterThan(0.05);
    expect(splitRate).toBeLessThan(0.6);
    expect(unanimousCount).toBeGreaterThan(0);
  });

  it('a blowout tape (one fighter dominant every round) is scored unanimous for that fighter', () => {
    const blowout: RoundTape[] = closeTape.map((r) => ({
      ...r,
      strikesLandedA: 40,
      strikesLandedB: 5,
      controlTimeA: 80,
      controlTimeB: 5,
      submissionThreatsA: 2,
      submissionThreatsB: 0,
    }));
    const rng = mulberry32(5);
    const scorecards = judges.map((judge) => scoreFight(blowout, judge, balance, rng));
    expect(decideFight(scorecards)).toEqual({ method: 'UD', winner: 'a' });
  });
});
