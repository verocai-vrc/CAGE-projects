import { describe, expect, it } from 'vitest';
import { resolveCampWeek, type CampBalance } from '../src/career/camp';
import type { Fighter } from '../src/engine/types';

const testBalance: CampBalance = {
  weeklyEnergyBudget: 10,
  trainingGainPerEnergy: 0.4,
  restRegenPerEnergy: 1.5,
  defaultTrainingPartnerQuality: 0.75,
};

function makeFighter(overrides: Partial<Fighter> = {}): Fighter {
  return {
    id: 'f1',
    name: 'Test Fighter',
    nationality: 'fixture',
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
    traits: [],
    condition: { health: 70, injuries: [] },
    ...overrides,
  };
}

describe('resolveCampWeek', () => {
  it('training allocation raises attributes, gated by training-partner quality', () => {
    const fighter = makeFighter();
    const full = resolveCampWeek(
      fighter,
      { training: 10, weightManagement: 0, rest: 0 },
      testBalance,
      1,
    );
    const half = resolveCampWeek(
      fighter,
      { training: 10, weightManagement: 0, rest: 0 },
      testBalance,
      0.5,
    );

    expect(full.fighter.attributes.power).toBeGreaterThan(fighter.attributes.power);
    expect(half.fighter.attributes.power).toBeGreaterThan(fighter.attributes.power);
    expect(half.fighter.attributes.power).toBeLessThan(full.fighter.attributes.power);
  });

  it('a zero training-partner quality produces no attribute gains', () => {
    const fighter = makeFighter();
    const result = resolveCampWeek(
      fighter,
      { training: 10, weightManagement: 0, rest: 0 },
      testBalance,
      0,
    );
    expect(result.fighter.attributes).toEqual(fighter.attributes);
  });

  it('rest allocation regenerates condition.health, capped at 100', () => {
    const fighter = makeFighter({ condition: { health: 70, injuries: [] } });
    const result = resolveCampWeek(fighter, { training: 0, weightManagement: 0, rest: 10 }, testBalance);
    expect(result.fighter.condition.health).toBeGreaterThan(70);
    expect(result.fighter.condition.health).toBeLessThanOrEqual(100);

    const alreadyFull = makeFighter({ condition: { health: 100, injuries: [] } });
    const capped = resolveCampWeek(alreadyFull, { training: 0, weightManagement: 0, rest: 10 }, testBalance);
    expect(capped.fighter.condition.health).toBe(100);
  });

  it('never spends more energy than the weekly budget, even if over-allocated', () => {
    const fighter = makeFighter();
    const result = resolveCampWeek(
      fighter,
      { training: 20, weightManagement: 20, rest: 20 },
      testBalance,
    );
    const totalSpent = result.energySpent.training + result.energySpent.weightManagement + result.energySpent.rest;
    expect(totalSpent).toBeLessThanOrEqual(testBalance.weeklyEnergyBudget + 1e-9);
    expect(result.energyRemaining).toBeGreaterThanOrEqual(0);
  });

  it('energy remaining is never negative, including for under-allocated weeks', () => {
    const fighter = makeFighter();
    const under = resolveCampWeek(fighter, { training: 2, weightManagement: 1, rest: 1 }, testBalance);
    expect(under.energyRemaining).toBe(6);
    expect(under.energyRemaining).toBeGreaterThanOrEqual(0);

    const zero = resolveCampWeek(fighter, { training: 0, weightManagement: 0, rest: 0 }, testBalance);
    expect(zero.energyRemaining).toBe(testBalance.weeklyEnergyBudget);
  });

  it('rejects negative allocations rather than letting them inflate energy remaining', () => {
    const fighter = makeFighter();
    const result = resolveCampWeek(
      fighter,
      { training: -5, weightManagement: 0, rest: 0 },
      testBalance,
    );
    expect(result.energySpent.training).toBe(0);
    expect(result.energyRemaining).toBe(testBalance.weeklyEnergyBudget);
  });

  it('always resolves to a new, schema-valid fighter state (attributes in range, same id/identity fields)', () => {
    const fighter = makeFighter();
    const result = resolveCampWeek(
      fighter,
      { training: 10, weightManagement: 10, rest: 10 },
      testBalance,
    );
    expect(result.fighter.id).toBe(fighter.id);
    expect(result.fighter.name).toBe(fighter.name);
    for (const value of Object.values(result.fighter.attributes)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
    expect(result.fighter.condition.health).toBeGreaterThanOrEqual(0);
    expect(result.fighter.condition.health).toBeLessThanOrEqual(100);
    // original fighter object is untouched (pure function, no mutation)
    expect(fighter.attributes.power).toBe(50);
  });
});
