// budgetSplit.spec.ts — Loop 6.7's named verify: "BudgetSplit cannot produce a
// total above the budget, by construction. Unit test it."
//
// The component has no exported logic (same situation as PortraitEditor,
// portraitEditor.spec.ts) — it is a Preact component and this repo has no DOM
// testing library, so interaction is verified by the Playwright driver
// instead (§15.9's own verify list: screenshots + a keyboard/touch pass).
// What belongs in a unit test is the boundary math itself: moving a divider
// grows or shrinks only its own pillar (shifting every later boundary along
// with it, so a later pillar's width is untouched) and is clamped to
// [the previous divider, the budget] — the mechanism that makes
// over-allocation structurally unreachable rather than merely
// checked-and-rejected. Mirrored by hand from BudgetSplit.tsx's
// moveDivider/commitBoundaries — keep this in sync if that logic changes.

import { describe, expect, it } from 'vitest';

function boundariesToValues(boundaries: number[]): number[] {
  const values: number[] = [];
  let prev = 0;
  for (const b of boundaries) {
    values.push(b - prev);
    prev = b;
  }
  return values;
}

// Mirrors BudgetSplit.tsx's clampedDelta + moveDivider. The shift is clamped
// against BOTH ends: shrinking is bounded by the previous divider, growing is
// bounded by the unspent tail (budget minus the LAST boundary) — clamping
// only boundary i against the budget still lets the cascade push later
// boundaries past it, which is exactly the bug this file's fuzz test caught.
function clampedDelta(boundaries: number[], budget: number, i: number, delta: number): number {
  const lowerBound = i === 0 ? 0 : boundaries[i - 1];
  const lastBoundary = boundaries[boundaries.length - 1];
  const room = budget - lastBoundary;
  if (delta >= 0) return Math.min(delta, room);
  return Math.max(delta, lowerBound - boundaries[i]);
}

function moveDivider(boundaries: number[], budget: number, i: number, delta: number): number[] {
  const appliedDelta = clampedDelta(boundaries, budget, i, delta);
  return boundaries.map((b, j) => (j >= i ? b + appliedDelta : b));
}

const BUDGET = 10;
const PILLAR_COUNT = 4;

function zeroBoundaries(): number[] {
  return Array.from({ length: PILLAR_COUNT }, () => 0);
}

describe('BudgetSplit divider math', () => {
  it('starts at zero allocation with the full budget unspent', () => {
    const values = boundariesToValues(zeroBoundaries());
    expect(values).toEqual([0, 0, 0, 0]);
  });

  it('a single divider cannot push spend above the budget', () => {
    let boundaries = zeroBoundaries();
    // Try to drag the first divider far past the budget in one move.
    boundaries = moveDivider(boundaries, BUDGET, 0, BUDGET * 100);
    expect(boundaries[0]).toBeLessThanOrEqual(BUDGET);
    const total = boundariesToValues(boundaries).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(BUDGET);
  });

  it('a divider cannot move left of its lower neighbour', () => {
    let boundaries = [3, 5, 5, 5];
    // Try to drag divider 1 (currently at 5) below divider 0 (at 3).
    boundaries = moveDivider(boundaries, BUDGET, 1, -100);
    expect(boundaries[1]).toBe(3);
    const values = boundariesToValues(boundaries);
    expect(values.every((v) => v >= 0)).toBe(true);
  });

  it('growing an early pillar from zero does not require first moving a later divider (regression: arrow keys did nothing from an all-zero split)', () => {
    // The bug this guards against: an earlier version clamped divider i's
    // upper bound to boundaries[i + 1], which starts at 0 for every pillar
    // before anything is allocated — so divider 0 could never move right
    // and ArrowRight was a silent no-op for the first pillar's control.
    let boundaries = zeroBoundaries();
    boundaries = moveDivider(boundaries, BUDGET, 0, 6);
    const values = boundariesToValues(boundaries);
    expect(values[0]).toBe(6);
  });

  it('growing an earlier pillar shifts later boundaries with it, leaving every later pillar\'s own width unchanged', () => {
    // life=3 is 3 wide (boundary goes from 7 to 10). Growing training by 2
    // (pulled from the unspent tail, since nothing is fully allocated) must
    // not shrink life's own width even though life's boundary moves.
    let boundaries = [2, 4, 7, 10]; // training=2, weightManagement=2, rest=3, life=3, unspent=0... wait budget is 10, life ends at 10
    const before = boundariesToValues(boundaries);
    // Free up room first: budget is fully spent, so shrink training first to
    // create tail room, then grow it back by less than that to keep this a
    // clean "grow into available tail" case matching the component's actual
    // clamp (upperBound is only ever `budget`, never blocked by a neighbour).
    boundaries = moveDivider(boundaries, BUDGET, 0, -2); // training -> 0, cascades: [0,2,5,8]
    boundaries = moveDivider(boundaries, BUDGET, 0, 1); // training -> 1, cascades: [1,3,6,9]
    const after = boundariesToValues(boundaries);
    expect(after[0]).toBe(1);
    // weightManagement, rest and life kept their own widths across both moves.
    expect(after[1]).toBe(before[1]);
    expect(after[2]).toBe(before[2]);
    expect(after[3]).toBe(before[3]);
  });

  it('a long random sequence of drags and arrow-key steps never exceeds the budget', () => {
    let boundaries = zeroBoundaries();
    let seed = 42;
    function rand() {
      // Deterministic PRNG so a failure is reproducible.
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    }

    for (let step = 0; step < 500; step++) {
      const i = Math.floor(rand() * PILLAR_COUNT);
      const delta = Math.floor(rand() * 21) - 10; // -10..10
      boundaries = moveDivider(boundaries, BUDGET, i, delta);

      const values = boundariesToValues(boundaries);
      const total = values.reduce((a, b) => a + b, 0);
      expect(total).toBeLessThanOrEqual(BUDGET + 1e-9);
      expect(values.every((v) => v >= -1e-9)).toBe(true);
      // Boundaries never decrease left-to-right (each pillar's width is non-negative).
      for (let k = 1; k < boundaries.length; k++) {
        expect(boundaries[k]).toBeGreaterThanOrEqual(boundaries[k - 1] - 1e-9);
      }
    }
  });

  it('moving the last divider to the budget spends everything, leaving no unspent tail', () => {
    let boundaries = zeroBoundaries();
    boundaries = moveDivider(boundaries, BUDGET, PILLAR_COUNT - 1, BUDGET);
    const values = boundariesToValues(boundaries);
    const total = values.reduce((a, b) => a + b, 0);
    expect(total).toBe(BUDGET);
  });

  it('requesting far more than the budget across all pillars still resolves to exactly the budget, never over', () => {
    // Mirrors career/camp.ts's clampAllocation contract at the UI layer: an
    // extreme request degrades to the budget, never past it.
    let boundaries = zeroBoundaries();
    for (let i = 0; i < PILLAR_COUNT; i++) {
      boundaries = moveDivider(boundaries, BUDGET, i, 1000);
    }
    const values = boundariesToValues(boundaries);
    expect(values.reduce((a, b) => a + b, 0)).toBe(BUDGET);
    expect(values.every((v) => v >= 0)).toBe(true);
  });
});
