// lab/report.ts — win-rate matrix, finish-rate distribution, average round
// length, and stamina-fade curves from a batch of SimFightRecords (§10).
//
// Documented believable-band targets for the archetype fixtures, tuned via
// balance.json (kFinish, baseStrikeDamage, significantStrikeChance,
// submissionAttemptChance), never engine code — DESIGN.md §10:
//   - No archetype's win rate against the field average exceeds ~60%.
//   - Finish rate (KO + TKO + SUB) target band: 55-85% of fights; the
//     remainder go to a judges' decision or draw.
//   - Neither KO/TKO nor SUB should be ~0% or ~100% of all finishes — both
//     finish routes need to be live outcomes, not decorative.
//
// Loop 7.2 re-tune (DESIGN.md §16.1), measured at N=3000 per ordered pairing:
//
//                        before            after
//   baseStrikeDamage     0.3               2.8
//   significantStrikeChance 0.016          0.010
//   finish rate          70.8%             68.4%
//   KO / TKO / SUB       52.4 / 0.0 / 18.4  37.7 / 12.3 / 18.4
//   decision / draw      27.8 / 1.4        30.1 / 1.4
//   avg end round        2.34              2.33
//   field avg (str/wr/all) 50.6/46.0/51.3  50.4/46.1/51.4
//   wrestler vs striker  55.0%             55.0%
//
// `kFinish` was measured across 4/6/9/14 at the new damage and moved the
// distribution by under a point on every line — once damage is real, a
// significant strike arrives with the power-vs-effectiveChin delta already far
// from zero, so the slope of the logistic there is not the binding constraint.
// It stays at 6 rather than being changed for the sake of the sweep.

import type { SimFightRecord } from './simulate';
import { simulateStaminaCurve } from '../engine/round';
import { archetypes, balance } from '../content';

export interface WinRateMatrixRow {
  archetype: string;
  winRateVs: Record<string, number>;
  fieldAverageWinRate: number;
}

export function buildWinRateMatrix(records: SimFightRecord[]): WinRateMatrixRow[] {
  const ids = archetypes.map((entry) => entry.id);

  return ids.map((archetype) => {
    const winRateVs: Record<string, number> = {};

    for (const opponent of ids) {
      if (opponent === archetype) continue;
      const pairing = records.filter(
        (r) =>
          (r.archetypeA === archetype && r.archetypeB === opponent) ||
          (r.archetypeB === archetype && r.archetypeA === opponent),
      );
      const wins = pairing.filter(
        (r) => (r.archetypeA === archetype && r.winner === 'a') || (r.archetypeB === archetype && r.winner === 'b'),
      ).length;
      winRateVs[opponent] = pairing.length > 0 ? wins / pairing.length : 0;
    }

    const rates = Object.values(winRateVs);
    const fieldAverageWinRate = rates.length > 0 ? rates.reduce((sum, v) => sum + v, 0) / rates.length : 0;
    return { archetype, winRateVs, fieldAverageWinRate };
  });
}

export interface FinishRateDistribution {
  total: number;
  ko: number;
  tko: number;
  sub: number;
  decision: number; // UD + SD + MD
  draw: number;
  koRate: number;
  tkoRate: number;
  subRate: number;
  decisionRate: number;
  drawRate: number;
  finishRate: number; // ko + tko + sub
}

export function buildFinishRateDistribution(records: SimFightRecord[]): FinishRateDistribution {
  const total = records.length;
  const ko = records.filter((r) => r.method === 'KO').length;
  const tko = records.filter((r) => r.method === 'TKO').length;
  const sub = records.filter((r) => r.method === 'SUB').length;
  const decision = records.filter((r) => r.method === 'UD' || r.method === 'SD' || r.method === 'MD').length;
  const draw = records.filter((r) => r.method === 'DRAW').length;

  return {
    total,
    ko,
    tko,
    sub,
    decision,
    draw,
    koRate: total > 0 ? ko / total : 0,
    tkoRate: total > 0 ? tko / total : 0,
    subRate: total > 0 ? sub / total : 0,
    decisionRate: total > 0 ? decision / total : 0,
    drawRate: total > 0 ? draw / total : 0,
    finishRate: total > 0 ? (ko + tko + sub) / total : 0,
  };
}

export function averageEndRound(records: SimFightRecord[]): number {
  if (records.length === 0) return 0;
  return records.reduce((sum, r) => sum + r.endRound, 0) / records.length;
}

// Stamina-fade curve per archetype, reusing the isolated tick mechanic from
// Loop 1.3 rather than re-deriving it from full fight records.
export function buildStaminaFadeCurves(ticks = 60): Record<string, number[]> {
  const curves: Record<string, number[]> = {};
  for (const archetype of archetypes) {
    curves[archetype.id] = simulateStaminaCurve(archetype.attributes.cardio, balance, ticks);
  }
  return curves;
}
