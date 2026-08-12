import { describe, expect, it } from 'vitest';
import { resolveCutPenalty } from '../src/engine/weightcut';
import {
  computePillars,
  effectiveChin,
  resolveStrike,
  rollFinish,
  strikeDamage,
  tickStamina,
} from '../src/engine/round';
import { mulberry32, type RNG } from '../src/engine/rng';
import type { Attributes } from '../src/engine/types';
import { balance } from '../src/content';

describe('resolveCutPenalty', () => {
  it('returns the clean penalty (1.0, no debuff) for a clean cut', () => {
    expect(resolveCutPenalty('clean', balance)).toBe(balance.cutPenaltyClean);
    expect(resolveCutPenalty('clean', balance)).toBe(1);
  });

  it('returns the botched penalty (<1) for a botched cut', () => {
    expect(resolveCutPenalty('botched', balance)).toBe(balance.cutPenaltyBotched);
    expect(resolveCutPenalty('botched', balance)).toBeLessThan(1);
  });
});

// Minimal fight harness built from Loop 1.4's isolated round primitives, just
// to prove the cut penalty is load-bearing end to end. The real assembled
// pipeline (simulateFight, judging, full event log) is Loop 1.7's job.
const attrs: Attributes = {
  power: 60,
  technique: 60,
  speed: 60,
  wrestling: 55,
  groundControl: 55,
  chin: 60,
  cardio: 60,
  fightIQ: 55,
};

function simulateSimpleFight(cutPenaltyA: number, cutPenaltyB: number, rng: RNG): 'a' | 'b' {
  const striking = computePillars(attrs).striking;
  let staminaA = 100;
  let staminaB = 100;
  let healthA = 100;
  let healthB = 100;
  const TICKS = 60;

  for (let i = 0; i < TICKS; i++) {
    staminaA = tickStamina(staminaA, attrs.cardio * cutPenaltyA, balance);
    staminaB = tickStamina(staminaB, attrs.cardio * cutPenaltyB, balance);

    if (resolveStrike(striking, staminaA, striking, staminaB, balance.k, rng)) {
      const damage = strikeDamage(attrs.power * cutPenaltyA, balance.baseStrikeDamage);
      healthB = Math.max(0, healthB - damage);
      const chinB = effectiveChin(attrs.chin, healthB, 100, staminaB, cutPenaltyB);
      if (rollFinish(attrs.power * cutPenaltyA, chinB, balance.kFinish, rng)) return 'a';
    }
    if (resolveStrike(striking, staminaB, striking, staminaA, balance.k, rng)) {
      const damage = strikeDamage(attrs.power * cutPenaltyB, balance.baseStrikeDamage);
      healthA = Math.max(0, healthA - damage);
      const chinA = effectiveChin(attrs.chin, healthA, 100, staminaA, cutPenaltyA);
      if (rollFinish(attrs.power * cutPenaltyB, chinA, balance.kFinish, rng)) return 'b';
    }
    if (healthA <= 0) return 'b';
    if (healthB <= 0) return 'a';
  }
  return healthA >= healthB ? 'a' : 'b';
}

function winRateA(cutPenaltyA: number, cutPenaltyB: number, N: number, seedBase: number): number {
  let wins = 0;
  for (let i = 0; i < N; i++) {
    if (simulateSimpleFight(cutPenaltyA, cutPenaltyB, mulberry32(seedBase + i)) === 'a') wins++;
  }
  return wins / N;
}

describe('cut penalty applied through effectiveChin/power/cardio', () => {
  it('a botched cut measurably lowers win rate against an identical, cleanly-cut opponent', () => {
    const botchedPenalty = resolveCutPenalty('botched', balance);
    const cleanPenalty = resolveCutPenalty('clean', balance);
    const rate = winRateA(botchedPenalty, cleanPenalty, 1500, 42);
    expect(rate).toBeLessThan(0.42);
  });

  it('a clean cut does not skew the win rate against an identically clean-cut opponent', () => {
    const cleanPenalty = resolveCutPenalty('clean', balance);
    const rate = winRateA(cleanPenalty, cleanPenalty, 1500, 777);
    expect(rate).toBeGreaterThan(0.45);
    expect(rate).toBeLessThan(0.65);
  });
});
