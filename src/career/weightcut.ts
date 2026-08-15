// career/weightcut.ts — Loop 4.2: the camp-long consumer of engine/weightcut.ts's
// pure cutPenalty lookup (DESIGN.md §8.2). Diet and hydration are tracked here
// as a single accumulating "cut discipline" score, fed weekly by camp.ts's
// weightManagement energy allocation; at fight week it's classified into the
// CutQuality that engine/weightcut.ts's resolveCutPenalty already consumes.
// The engine's pure function is untouched — this is purely the career-layer
// bookkeeping that decides which CutQuality to hand it.

import type { CutQuality } from '../engine/types';

export const initialCutProgress = 0;

export interface WeightCutBalance {
  weightCutGainPerEnergy: number;
  cutQualityThreshold: number;
}

// Pure: one week's weightManagement energy nudges cut discipline up.
// Uncapped-input-safe (negative energy is clamped by camp.ts already) and
// clamped to 0..100 like every other progress bar in the career layer.
export function resolveWeightCutWeek(
  progress: number,
  weightManagementEnergy: number,
  balance: WeightCutBalance,
): number {
  const gained = Math.max(0, weightManagementEnergy) * balance.weightCutGainPerEnergy;
  return Math.max(0, Math.min(100, progress + gained));
}

// A cut earned over the camp (progress at or above threshold) comes in
// clean; anything short of that is rushed on fight week and comes in botched.
export function classifyCut(progress: number, balance: WeightCutBalance): CutQuality {
  return progress >= balance.cutQualityThreshold ? 'clean' : 'botched';
}
