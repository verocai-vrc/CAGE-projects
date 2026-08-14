// camp.ts — Loop 3.2: camp-week energy allocation (DESIGN.md §8.1). The core
// scarcity loop: a fixed weekly energy budget spent across training (attribute
// gains, gated by training-partner quality), weight management (feeds the
// fight-week cut — camp-long tracking is M4/Loop 4.2, this loop only reserves
// the allocation), and rest (condition.health regen). Life-bar decay (§8.3) is
// M4 — this function is deliberately decoupled from it.

import type { Attributes, Fighter } from '../engine/types';

export interface CampBalance {
  weeklyEnergyBudget: number;
  trainingGainPerEnergy: number;
  restRegenPerEnergy: number;
  defaultTrainingPartnerQuality: number;
}

// Energy spent per week, split across the three camp pillars (§8.1). Values
// are clamped and rebalanced against the budget in resolveCampWeek — this
// type does not itself guarantee a valid allocation.
export interface CampAllocation {
  training: number;
  weightManagement: number;
  rest: number;
}

export interface CampWeekResult {
  fighter: Fighter;
  energySpent: CampAllocation;
  energyRemaining: number;
}

// Which attributes each pillar's training energy raises, and in what
// proportion. Kept flat/even for now; archetype-specific training focus is a
// later loop's concern, not this one's.
const TRAINING_ATTRIBUTES: (keyof Attributes)[] = [
  'power',
  'technique',
  'speed',
  'wrestling',
  'groundControl',
  'cardio',
];

function clampAllocation(allocation: CampAllocation, budget: number): CampAllocation {
  const training = Math.max(0, allocation.training);
  const weightManagement = Math.max(0, allocation.weightManagement);
  const rest = Math.max(0, allocation.rest);
  const total = training + weightManagement + rest;

  // Never allow the week to spend more energy than the budget allows — scale
  // every pillar down proportionally rather than picking a winner.
  if (total <= budget || total === 0) return { training, weightManagement, rest };
  const scale = budget / total;
  return {
    training: training * scale,
    weightManagement: weightManagement * scale,
    rest: rest * scale,
  };
}

// Pure: given a fighter, a requested allocation, and this week's energy
// budget, returns a new fighter with training gains applied (gated by a flat
// training-partner-quality multiplier — real per-gym decay is M4/Loop 4.1)
// and rest regen applied to condition.health. Weight-management energy is
// reserved/validated here but has no fight-facing effect yet (Loop 4.2 wires
// it into the cut).
export function resolveCampWeek(
  fighter: Fighter,
  allocation: CampAllocation,
  balance: CampBalance,
  trainingPartnerQuality: number = balance.defaultTrainingPartnerQuality,
): CampWeekResult {
  const budget = balance.weeklyEnergyBudget;
  const spent = clampAllocation(allocation, budget);

  const gainPerAttribute = spent.training * balance.trainingGainPerEnergy * trainingPartnerQuality;

  // Attributes are integers on a 0-100 scale (DESIGN.md §4) — round each
  // gain rather than letting fractional camp gains accumulate silently.
  const attributes: Attributes = { ...fighter.attributes };
  for (const key of TRAINING_ATTRIBUTES) {
    attributes[key] = Math.min(100, Math.round(attributes[key] + gainPerAttribute));
  }

  const healthRegen = spent.rest * balance.restRegenPerEnergy;
  const health = Math.min(100, Math.round(fighter.condition.health + healthRegen));

  const energyRemaining = Math.max(
    0,
    budget - (spent.training + spent.weightManagement + spent.rest),
  );

  return {
    fighter: {
      ...fighter,
      attributes,
      condition: { ...fighter.condition, injuries: fighter.condition.injuries, health },
    },
    energySpent: spent,
    energyRemaining,
  };
}
