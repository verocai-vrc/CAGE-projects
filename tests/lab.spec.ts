import { describe, expect, it } from 'vitest';
import { runAllPairings, runArchetypePairing } from '../src/lab/simulate';
import { buildFinishRateDistribution, buildWinRateMatrix } from '../src/lab/report';

// M1 exit gate (DESIGN.md §12): the balance lab's acceptance gates from §10,
// run against the fixture archetypes. N is smaller than the lab UI's
// interactive 10,000-per-pairing default so this stays fast in CI while
// remaining statistically meaningful.
const N = 3000;

describe('balance lab acceptance gates (M1 exit criteria)', () => {
  it('no archetype fixture wins more than ~60% against the field average', () => {
    const records = runAllPairings(N);
    const matrix = buildWinRateMatrix(records);
    for (const row of matrix) {
      expect(row.fieldAverageWinRate).toBeLessThanOrEqual(0.6);
    }
  });

  it('matchup-over-rating: the lower-overall grappling specialist (wrestler) beats the higher-overall striker at a measurable, non-trivial rate', () => {
    // striker: higher raw overall rating, dominant striking pillar, weak
    // grappling. wrestler: lower raw overall rating, dominant grappling
    // pillar, weak striking. This is the exact "high-grappling/lower-overall
    // vs high-striking/higher-overall" matchup DESIGN.md §10 calls for.
    const records = runArchetypePairing('wrestler', 'striker', N);
    const wrestlerWins = records.filter((r) => r.winner === 'a').length;
    const wrestlerWinRate = wrestlerWins / records.length;

    // Non-trivial: meaningfully better than a coin flip going the specialist's
    // way would need to be, and nowhere near negligible.
    expect(wrestlerWinRate).toBeGreaterThan(0.35);
    expect(wrestlerWinRate).toBeLessThan(0.65);
  });

  it('finish-rate distribution lands in the documented believable band (see lab/report.ts)', () => {
    const records = runAllPairings(N);
    const finishes = buildFinishRateDistribution(records);

    // Target band documented in lab/report.ts's header comment.
    expect(finishes.finishRate).toBeGreaterThan(0.55);
    expect(finishes.finishRate).toBeLessThan(0.85);

    // Neither finish route should be decorative.
    expect(finishes.koRate + finishes.tkoRate).toBeGreaterThan(0.05);
    expect(finishes.subRate).toBeGreaterThan(0.05);
  });
});
