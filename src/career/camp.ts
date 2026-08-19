// camp.ts — Loop 3.2: camp-week energy allocation (DESIGN.md §8.1). The core
// scarcity loop: a fixed weekly energy budget spent across training (attribute
// gains, gated by training-partner quality), weight management (feeds the
// fight-week cut — camp-long tracking is M4/Loop 4.2, this loop only reserves
// the allocation), rest (condition.health regen), and life (§8.3 — nurturing
// the life bars tracked in life.ts, which competes for the same energy
// budget as everything else). Life-bar *decay* and the multipliers those
// bars produce are life.ts's concern; this file only reserves the energy and
// applies whatever multipliers the caller hands it (Loop 4.1).

import type { Attributes, Fighter } from '../engine/types';
import { specialtyMultiplierFor, type GymBalance, type GymSpecialty } from './gym';

export interface CampBalance extends GymBalance {
  weeklyEnergyBudget: number;
  trainingGainPerEnergy: number;
  restRegenPerEnergy: number;
  defaultTrainingPartnerQuality: number;
}

/**
 * Loop 7.8: the trailing optionals collapsed into an options object, the same
 * move Loop 7.1 made on `startCareer` and for the same reason — `specialty` is
 * the third of them, and a caller wanting only that would otherwise have to
 * pass `undefined, undefined` to reach past the other two.
 */
export interface CampWeekOptions {
  /** 0..1. Since §16.8 this is the gym's reputation ceiling modulated by the
   *  trainingPartners life bar, not the bar alone. */
  trainingPartnerQuality?: number;
  /** 0..1, from life.ts's partner bar (§8.3). */
  focusMultiplier?: number;
  /** The gym's specialty (§16.8 effect 1). Omitted means an unbiased week —
   *  every attribute gains at the flat rate, which is what every pre-7.8 test
   *  expects and what a career with no gym resolved to. */
  specialty?: GymSpecialty;
}

// Energy spent per week, split across the camp pillars (§8.1). `life` is
// optional (defaults to 0) so existing training/weightManagement/rest-only
// call sites don't need updating. Values are clamped and rebalanced against
// the budget in resolveCampWeek — this type does not itself guarantee a
// valid allocation.
export interface CampAllocation {
  training: number;
  weightManagement: number;
  rest: number;
  life?: number;
}

export interface ResolvedCampAllocation {
  training: number;
  weightManagement: number;
  rest: number;
  life: number;
}

export interface CampWeekResult {
  fighter: Fighter;
  energySpent: ResolvedCampAllocation;
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

function clampAllocation(allocation: CampAllocation, budget: number): ResolvedCampAllocation {
  const training = Math.max(0, allocation.training);
  const weightManagement = Math.max(0, allocation.weightManagement);
  const rest = Math.max(0, allocation.rest);
  const life = Math.max(0, allocation.life ?? 0);
  const total = training + weightManagement + rest + life;

  // Never allow the week to spend more energy than the budget allows — scale
  // every pillar down proportionally rather than picking a winner.
  if (total <= budget || total === 0) return { training, weightManagement, rest, life };
  const scale = budget / total;
  return {
    training: training * scale,
    weightManagement: weightManagement * scale,
    rest: rest * scale,
    life: life * scale,
  };
}

// Pure: given a fighter, a requested allocation, and this week's energy
// budget, returns a new fighter with training gains applied (gated by
// trainingPartnerQuality — fed by life.ts's trainingPartners bar as of Loop
// 4.1) and rest regen applied to condition.health, gated by focusMultiplier
// (fed by life.ts's partner bar — DESIGN.md §8.3: neglecting your personal
// life drops energy regen). Weight-management and life energy are
// reserved/validated here but resolved elsewhere: weight-management feeds
// the fight-week cut (Loop 4.2), life energy feeds the life bars (life.ts).
export function resolveCampWeek(
  fighter: Fighter,
  allocation: CampAllocation,
  balance: CampBalance,
  {
    trainingPartnerQuality = balance.defaultTrainingPartnerQuality,
    focusMultiplier = 1,
    specialty,
  }: CampWeekOptions = {},
): CampWeekResult {
  const budget = balance.weeklyEnergyBudget;
  const spent = clampAllocation(allocation, budget);

  const baseGain = spent.training * balance.trainingGainPerEnergy * trainingPartnerQuality;

  // Attributes are integers on a 0-100 scale (DESIGN.md §4) — round each
  // gain rather than letting fractional camp gains accumulate silently.
  //
  // Loop 7.8 (§16.8 effect 1): the gain is biased per attribute by the gym's
  // specialty before rounding, so a striking gym's camp and a grappling gym's
  // camp spend the same energy on measurably different fighters. The rounding
  // stays where it was — biasing after rounding would let a 0.4 off-specialty
  // gain round to 0 and read as "this gym does not train wrestling at all".
  const attributes: Attributes = { ...fighter.attributes };
  for (const key of TRAINING_ATTRIBUTES) {
    const gain = specialty ? baseGain * specialtyMultiplierFor(specialty, key, balance) : baseGain;
    attributes[key] = Math.min(100, Math.round(attributes[key] + gain));
  }

  const healthRegen = spent.rest * balance.restRegenPerEnergy * focusMultiplier;
  const health = Math.min(100, Math.round(fighter.condition.health + healthRegen));

  const energyRemaining = Math.max(
    0,
    budget - (spent.training + spent.weightManagement + spent.rest + spent.life),
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
