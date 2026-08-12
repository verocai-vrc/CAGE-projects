// Cut quality -> fight-week modifier (DESIGN.md §6.4, §8.2). Fight-week
// resolution only — camp-long diet/hydration management (M4, Loop 4.2) will
// decide which CutQuality to pass in from accumulated camp state; this
// function stays a pure lookup.

import type { CutQuality } from './types';

export interface WeightCutBalance {
  cutPenaltyBotched: number;
  cutPenaltyClean: number;
}

// A clean cut applies no penalty (1.0); a botched cut multiplies
// effectiveChin, power, and cardio by a single penalty factor (<=1).
export function resolveCutPenalty(cutQuality: CutQuality, balance: WeightCutBalance): number {
  return cutQuality === 'botched' ? balance.cutPenaltyBotched : balance.cutPenaltyClean;
}
