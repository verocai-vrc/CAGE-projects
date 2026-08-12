import { describe, expect, it } from 'vitest';
import {
  computePillars,
  effectiveChin,
  resolvePositionChange,
  resolveStrike,
  rollFinish,
  simulateStaminaCurve,
  staminaDrainPerTick,
  staminaFactor,
  strikeDamage,
  tickStamina,
} from '../src/engine/round';
import { mulberry32 } from '../src/engine/rng';
import { balance } from '../src/content';

describe('staminaDrainPerTick', () => {
  it('drains less per tick for higher cardio at a fixed base', () => {
    expect(staminaDrainPerTick(90, balance)).toBeLessThan(staminaDrainPerTick(10, balance));
  });
});

describe('tickStamina', () => {
  it('never drops below 0', () => {
    let stamina = 1;
    for (let i = 0; i < 100; i++) stamina = tickStamina(stamina, 0, balance);
    expect(stamina).toBe(0);
  });
});

describe('staminaFactor', () => {
  it('is 1 at full stamina and 0 at empty', () => {
    expect(staminaFactor(100)).toBe(1);
    expect(staminaFactor(0)).toBe(0);
  });
});

describe('simulateStaminaCurve', () => {
  it('produces a measurably faster fade for a low-cardio fighter than a high-cardio one', () => {
    const ticks = 100;
    const low = simulateStaminaCurve(15, balance, ticks);
    const high = simulateStaminaCurve(90, balance, ticks);

    expect(low[low.length - 1]).toBeLessThan(high[high.length - 1]);

    const firstFadedTick = (curve: number[]) => curve.findIndex((s) => s <= balance.fadedStaminaThreshold);
    const lowFadedAt = firstFadedTick(low);
    const highFadedAt = firstFadedTick(high);

    expect(lowFadedAt).toBeGreaterThanOrEqual(0);
    expect(highFadedAt === -1 || lowFadedAt < highFadedAt).toBe(true);
  });
});

describe('computePillars', () => {
  it('derives striking, grappling, durability, and mind from the 8 attributes', () => {
    const pillars = computePillars({
      power: 90,
      technique: 90,
      speed: 90,
      wrestling: 10,
      groundControl: 10,
      chin: 70,
      cardio: 50,
      fightIQ: 40,
    });
    expect(pillars.striking).toBe(90);
    expect(pillars.grappling).toBe(10);
    expect(pillars.durability).toBe(60);
    expect(pillars.mind).toBe(40);
  });
});

describe('resolveStrike / resolvePositionChange monotonicity', () => {
  it('a much higher striking pillar lands significantly more often than an even one', () => {
    const N = 5000;
    const landRate = (attackerStriking: number, seed: number) => {
      const rng = mulberry32(seed);
      let landed = 0;
      for (let i = 0; i < N; i++) {
        if (resolveStrike(attackerStriking, 100, 50, 100, balance.k, rng)) landed++;
      }
      return landed / N;
    };
    expect(landRate(85, 1)).toBeGreaterThan(landRate(50, 2));
  });

  it('gassed attacker lands strikes less often than a fresh one at identical attributes', () => {
    const N = 5000;
    const landRate = (attackerStamina: number, seed: number) => {
      const rng = mulberry32(seed);
      let landed = 0;
      for (let i = 0; i < N; i++) {
        if (resolveStrike(70, attackerStamina, 70, 100, balance.k, rng)) landed++;
      }
      return landed / N;
    };
    expect(landRate(20, 3)).toBeLessThan(landRate(100, 4));
  });

  it('resolvePositionChange favors the higher grappling pillar', () => {
    const N = 5000;
    const rng = mulberry32(5);
    let successes = 0;
    for (let i = 0; i < N; i++) {
      if (resolvePositionChange(85, 100, 40, 100, balance.k, rng)) successes++;
    }
    expect(successes / N).toBeGreaterThan(0.5);
  });
});

describe('strikeDamage', () => {
  it('scales linearly with power', () => {
    expect(strikeDamage(100, balance.baseStrikeDamage)).toBe(balance.baseStrikeDamage);
    expect(strikeDamage(50, balance.baseStrikeDamage)).toBeCloseTo(balance.baseStrikeDamage / 2);
    expect(strikeDamage(0, balance.baseStrikeDamage)).toBe(0);
  });
});

describe('effectiveChin + rollFinish (§6.4)', () => {
  it('finish probability approaches 1 when power is high and the opponent is collapsed toward 0', () => {
    const collapsedChin = effectiveChin(60, 5, 100, 5, balance.cutPenaltyBotched);
    expect(collapsedChin).toBeGreaterThan(0);
    expect(collapsedChin).toBeLessThan(5);

    const rng = mulberry32(42);
    const N = 2000;
    let finishes = 0;
    for (let i = 0; i < N; i++) {
      if (rollFinish(95, collapsedChin, balance.kFinish, rng)) finishes++;
    }
    expect(finishes / N).toBeGreaterThan(0.95);
  });

  it('a fresh, full-health, high-chin opponent rarely gets finished by a single roll', () => {
    const freshChin = effectiveChin(75, 100, 100, 100, balance.cutPenaltyClean);
    const rng = mulberry32(7);
    const N = 2000;
    let finishes = 0;
    for (let i = 0; i < N; i++) {
      if (rollFinish(60, freshChin, balance.kFinish, rng)) finishes++;
    }
    expect(finishes / N).toBeLessThan(0.5);
  });
});

describe('determinism (DESIGN.md Appendix B — keep this test permanently)', () => {
  it('identical seed + inputs produce a byte-identical sequence of tick resolutions', () => {
    const runTicks = (seed: number) => {
      const rng = mulberry32(seed);
      const results: (boolean | number)[] = [];
      let staminaA = 100;
      let staminaB = 100;
      let healthB = 100;
      for (let i = 0; i < 50; i++) {
        staminaA = tickStamina(staminaA, 55, balance);
        staminaB = tickStamina(staminaB, 60, balance);
        const landed = resolveStrike(70, staminaA, 55, staminaB, balance.k, rng);
        results.push(landed);
        if (landed) {
          const dmg = strikeDamage(75, balance.baseStrikeDamage);
          healthB -= dmg;
          results.push(dmg);
          const finished = rollFinish(75, effectiveChin(60, healthB, 100, staminaB, 1), balance.kFinish, rng);
          results.push(finished);
        }
        results.push(resolvePositionChange(50, staminaA, 60, staminaB, balance.k, rng));
      }
      return results;
    };

    expect(runTicks(2026)).toEqual(runTicks(2026));
  });
});
