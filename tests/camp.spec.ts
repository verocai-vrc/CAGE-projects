import { describe, expect, it } from 'vitest';
import type { CampAllocation } from '../src/career/camp';
import { resolveCampWeek } from '../src/career/camp';
import type { Fighter } from '../src/engine/types';
import { FighterSchema } from '../src/state/schema';
import { archetypes, balance } from '../src/content';

function fighterFromArchetype(archetypeId: string): Fighter {
  const archetype = archetypes.find((entry) => entry.id === archetypeId);
  if (!archetype) throw new Error(`missing archetype fixture: ${archetypeId}`);
  return {
    id: 'player',
    name: 'Test Fighter',
    nationality: 'testland',
    weightClass: 'lightweight',
    stance: 'orthodox',
    attributes: { ...archetype.attributes },
    archetype: archetype.id,
    weakness: null,
    traits: [],
    condition: { health: 80, injuries: [] },
  };
}

const emptyAllocation: CampAllocation = { training: {}, weightManagement: 0, rest: 0 };

describe('resolveCampWeek: training gains gated by training-partner quality', () => {
  it('a fully-neglected training partner (quality 0) produces no gain', () => {
    const fighter = fighterFromArchetype('striker');
    const allocation: CampAllocation = { ...emptyAllocation, training: { power: 6 } };

    const result = resolveCampWeek(fighter, allocation, balance.energyPerWeek, 0);

    expect(result.fighter.attributes.power).toBe(fighter.attributes.power);
  });

  it('a better training-partner multiplier produces a strictly bigger gain for identical spend', () => {
    const fighter = fighterFromArchetype('striker');
    const allocation: CampAllocation = { ...emptyAllocation, training: { power: 6 } };

    const low = resolveCampWeek(fighter, allocation, balance.energyPerWeek, 0.5);
    const high = resolveCampWeek(fighter, allocation, balance.energyPerWeek, 1.5);

    expect(high.fighter.attributes.power).toBeGreaterThan(low.fighter.attributes.power);
    expect(low.fighter.attributes.power).toBeGreaterThan(fighter.attributes.power);
  });

  it('spending on one attribute leaves the others untouched', () => {
    const fighter = fighterFromArchetype('wrestler');
    const allocation: CampAllocation = { ...emptyAllocation, training: { cardio: 8 } };

    const result = resolveCampWeek(fighter, allocation, balance.energyPerWeek, 1);

    expect(result.fighter.attributes.cardio).toBeGreaterThan(fighter.attributes.cardio);
    expect(result.fighter.attributes.power).toBe(fighter.attributes.power);
    expect(result.fighter.attributes.wrestling).toBe(fighter.attributes.wrestling);
  });
});

describe('resolveCampWeek: energy budget cannot go negative', () => {
  it('clamps an over-allocated request so spend never exceeds the budget', () => {
    const fighter = fighterFromArchetype('allrounder');
    const allocation: CampAllocation = {
      training: { power: 100, technique: 100, cardio: 100 },
      weightManagement: 50,
      rest: 50,
    };

    const result = resolveCampWeek(fighter, allocation, 10, 1);

    expect(result.energySpent).toBeLessThanOrEqual(result.energyAvailable);
    expect(result.energyAvailable - result.energySpent).toBeGreaterThanOrEqual(0);
  });

  it('an empty allocation spends nothing', () => {
    const fighter = fighterFromArchetype('allrounder');
    const result = resolveCampWeek(fighter, emptyAllocation, balance.energyPerWeek, 1);

    expect(result.energySpent).toBe(0);
    expect(result.fighter).toEqual(fighter);
  });
});

describe('resolveCampWeek: a week always resolves to a new, valid fighter state', () => {
  it('produces a schema-valid Fighter for a normal allocation', () => {
    const fighter = fighterFromArchetype('striker');
    const allocation: CampAllocation = { training: { power: 3, fightIQ: 2 }, weightManagement: 1, rest: 4 };

    const result = resolveCampWeek(fighter, allocation, balance.energyPerWeek, 1);

    expect(FighterSchema.safeParse(result.fighter).success).toBe(true);
  });

  it('keeps attributes within 0..100 even for an over-budget, single-stat dump', () => {
    const fighter = fighterFromArchetype('striker');
    // Already near the cap; a huge additional spend must still clamp at 100.
    const allocation: CampAllocation = { training: { technique: 500 }, weightManagement: 0, rest: 0 };

    const result = resolveCampWeek(fighter, allocation, balance.energyPerWeek, 1);

    expect(result.fighter.attributes.technique).toBeLessThanOrEqual(100);
    expect(FighterSchema.safeParse(result.fighter).success).toBe(true);
  });

  it('rest heals condition.health without exceeding 100, and does not mutate the input fighter', () => {
    const fighter = fighterFromArchetype('wrestler');
    const allocation: CampAllocation = { ...emptyAllocation, rest: 10 };

    const result = resolveCampWeek(fighter, allocation, balance.energyPerWeek, 1);

    expect(result.fighter.condition.health).toBeGreaterThan(fighter.condition.health);
    expect(result.fighter.condition.health).toBeLessThanOrEqual(100);
    expect(fighter.condition.health).toBe(80); // input untouched
  });
});
