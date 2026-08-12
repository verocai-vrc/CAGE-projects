// Scorecards and decisions (DESIGN.md §6.5). Each round is scored from strike
// differential, control time, knockdowns, and submission threats, then run
// through a judge's independent bias vector and noise term — split
// decisions and controversy emerge for free, no scripting.

import type { RNG } from './rng';
import type { Scorecard } from './types';

export interface RoundTape {
  round: number;
  strikesLandedA: number;
  strikesLandedB: number;
  controlTimeA: number;
  controlTimeB: number;
  knockdownsA: number; // knockdowns scored BY A (against B)
  knockdownsB: number;
  submissionThreatsA: number;
  submissionThreatsB: number;
}

export interface JudgeBias {
  strike: number;
  control: number;
  knockdown: number;
  submission: number;
}

export interface Judge {
  id: string;
  name: string;
  bias: JudgeBias;
  noise: number;
}

export interface JudgingBalance {
  dominantRoundThreshold: number;
}

export function scoreRound(
  tape: RoundTape,
  judge: Judge,
  balance: JudgingBalance,
  rng: RNG,
): { a: number; b: number } {
  const diff =
    judge.bias.strike * (tape.strikesLandedA - tape.strikesLandedB) +
    judge.bias.control * (tape.controlTimeA - tape.controlTimeB) +
    judge.bias.knockdown * (tape.knockdownsA - tape.knockdownsB) +
    judge.bias.submission * (tape.submissionThreatsA - tape.submissionThreatsB);
  const noisyDiff = diff + (rng.next() * 2 - 1) * judge.noise;

  if (noisyDiff > balance.dominantRoundThreshold) return { a: 10, b: 8 };
  if (noisyDiff < -balance.dominantRoundThreshold) return { a: 8, b: 10 };
  if (noisyDiff >= 0) return { a: 10, b: 9 };
  return { a: 9, b: 10 };
}

export function scoreFight(tapes: RoundTape[], judge: Judge, balance: JudgingBalance, rng: RNG): Scorecard {
  return {
    judgeId: judge.id,
    roundScores: tapes.map((tape) => scoreRound(tape, judge, balance, rng)),
  };
}

export function scorecardTotal(scorecard: Scorecard): { a: number; b: number } {
  return scorecard.roundScores.reduce((acc, r) => ({ a: acc.a + r.a, b: acc.b + r.b }), { a: 0, b: 0 });
}

export type DecisionMethod = 'UD' | 'SD' | 'MD' | 'DRAW';

export function decideFight(scorecards: Scorecard[]): { method: DecisionMethod; winner: 'a' | 'b' | null } {
  const picks = scorecards.map((sc) => {
    const total = scorecardTotal(sc);
    if (total.a > total.b) return 'a' as const;
    if (total.b > total.a) return 'b' as const;
    return 'draw' as const;
  });

  const aCount = picks.filter((p) => p === 'a').length;
  const bCount = picks.filter((p) => p === 'b').length;
  const drawCount = picks.filter((p) => p === 'draw').length;

  if (aCount === picks.length) return { method: 'UD', winner: 'a' };
  if (bCount === picks.length) return { method: 'UD', winner: 'b' };
  if (aCount > bCount && drawCount > 0) return { method: 'MD', winner: 'a' };
  if (bCount > aCount && drawCount > 0) return { method: 'MD', winner: 'b' };
  if (aCount > bCount) return { method: 'SD', winner: 'a' };
  if (bCount > aCount) return { method: 'SD', winner: 'b' };
  return { method: 'DRAW', winner: null };
}
