// camp.ts — DESIGN.md §8.1: the scarce weekly energy budget spent across
// training, weight management, and rest. Training gains are gated by a
// training-partner quality multiplier — for M3 this is a flat stub
// (default 1, i.e. full effectiveness); the real neglect-based decay that
// drives this multiplier down is M4 (Loop 4.1, career/life.ts).
//
// Weight management is tracked as an energy sink here (it competes for the
// same scarce budget) but has no effect on the fighter yet — the camp-long
// diet/hydration system that consumes it resolves into cutPenalty in
// Loop 4.2. Rest restores condition.health, the long-term wear stat, not
// in-fight health.

import type { Attributes, Fighter } from '../engine/types';
import { balance } from '../content';

export type TrainingAllocation = Partial<Record<keyof Attributes, number>>;

export interface CampAllocation {
  training: TrainingAllocation; // energy spent per attribute, this week
  weightManagement: number; // energy spent; stubbed no-op until Loop 4.2
  rest: number; // energy spent; restores condition.health
}

export interface CampWeekResult {
  fighter: Fighter;
  energySpent: number; // total, never exceeds energyAvailable
  energyAvailable: number; // the budget this result was resolved against
}

const ATTRIBUTE_KEYS: (keyof Attributes)[] = [
  'power',
  'technique',
  'speed',
  'wrestling',
  'groundControl',
  'chin',
  'cardio',
  'fightIQ',
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Scales every requested allocation down proportionally so the total never
// exceeds the week's energy budget — a week always resolves, it never
// throws on a caller (e.g. a UI slider) that requests more than it has.
function normalizeAllocation(allocation: CampAllocation, energyAvailable: number): CampAllocation {
  const trainingTotal = ATTRIBUTE_KEYS.reduce((sum, key) => sum + (allocation.training[key] ?? 0), 0);
  const requestedTotal = trainingTotal + allocation.weightManagement + allocation.rest;

  if (requestedTotal <= energyAvailable) return allocation;

  const scale = requestedTotal > 0 ? energyAvailable / requestedTotal : 0;
  const training: TrainingAllocation = {};
  for (const key of ATTRIBUTE_KEYS) {
    const value = allocation.training[key];
    if (value !== undefined) training[key] = value * scale;
  }
  return {
    training,
    weightManagement: allocation.weightManagement * scale,
    rest: allocation.rest * scale,
  };
}

export function resolveCampWeek(
  fighter: Fighter,
  allocation: CampAllocation,
  energyAvailable: number = balance.energyPerWeek,
  trainingPartnerQuality: number = 1,
): CampWeekResult {
  const normalized = normalizeAllocation(allocation, Math.max(0, energyAvailable));

  const attributes: Attributes = { ...fighter.attributes };
  let trainingSpent = 0;
  for (const key of ATTRIBUTE_KEYS) {
    const spent = normalized.training[key] ?? 0;
    if (spent <= 0) continue;
    trainingSpent += spent;
    const gain = spent * balance.trainingGainPerEnergy * trainingPartnerQuality;
    attributes[key] = clamp(Math.round(attributes[key] + gain), 0, 100);
  }

  const healthGain = normalized.rest * balance.restHealPerEnergy;
  const health = clamp(fighter.condition.health + healthGain, 0, 100);

  const energySpent = trainingSpent + normalized.weightManagement + normalized.rest;

  return {
    fighter: {
      ...fighter,
      attributes,
      condition: { ...fighter.condition, health },
    },
    energySpent,
    energyAvailable,
  };
}
