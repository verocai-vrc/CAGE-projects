import { describe, expect, it } from 'vitest';
import { simulateStaminaCurve, staminaDrainPerTick, staminaFactor, tickStamina } from '../src/engine/round';
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
