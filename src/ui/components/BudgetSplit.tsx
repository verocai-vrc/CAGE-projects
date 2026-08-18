// BudgetSplit.tsx — Loop 6.7: the camp week's energy allocation as one bar,
// not four sliders (§15.8). A fixed-width track holds one segment per pillar
// plus a hatched tail for whatever energy is left unspent; the divider after
// each pillar is what the player drags or arrows to grow or shrink it.
//
// Each divider grows/shrinks only its own pillar, always trading against the
// unspent tail — moving divider i shifts boundaries[i..] by the same amount,
// which is what keeps every later pillar's own width fixed while an earlier
// one changes size, rather than eating into it. The over-allocation state
// this replaces cannot happen here by construction: a divider is clamped to
// [the previous divider, the budget], so segment widths always sum to at
// most `budget`. There is no clamp to write and no warning to show, because
// there is no invalid position for a divider to reach.

import { useRef, useState } from 'preact/hooks';
import styles from './BudgetSplit.module.css';

export interface BudgetPillar {
  id: string;
  label: string;
}

interface BudgetSplitProps {
  budget: number;
  pillars: BudgetPillar[];
  value: Record<string, number>;
  onChange: (value: Record<string, number>) => void;
}

// Dividers move in whole-energy steps — camp allocations are integers
// (DESIGN.md §8.1) and a fractional divider position would read a value the
// rest of the game never shows.
const STEP = 1;

export function BudgetSplit({ budget, pillars, value, onChange }: BudgetSplitProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Cumulative boundary after each pillar, e.g. [training, +weightMgmt, +rest, +life].
  // boundaries[pillars.length - 1] is total spent; the tail is budget - that.
  const boundaries: number[] = [];
  let running = 0;
  for (const p of pillars) {
    running += Math.max(0, value[p.id] ?? 0);
    boundaries.push(running);
  }
  const spent = boundaries[boundaries.length - 1] ?? 0;
  const unspent = Math.max(0, budget - spent);

  function commitBoundaries(next: number[]) {
    const clamped = next.map((b) => Math.max(0, Math.min(budget, b)));
    const nextValue: Record<string, number> = {};
    let prev = 0;
    pillars.forEach((p, i) => {
      nextValue[p.id] = clamped[i] - prev;
      prev = clamped[i];
    });
    onChange(nextValue);
  }

  // Grow or shrink pillar index `i` by `delta` energy, pulled from (or given
  // back to) the unspent tail — every other pillar's own width is untouched.
  // Boundary `i` and every boundary after it shift by the same delta, which
  // is what keeps a later pillar's width constant while an earlier one grows:
  // only the space between consecutive boundaries is a width, so moving them
  // together moves the segment without resizing it.
  //
  // The shift has to be clamped against BOTH ends, not just boundary `i`:
  // shrinking is bounded by the previous divider (boundary `i` cannot pass
  // it), and growing is bounded by the unspent tail (the LAST boundary is
  // the one that would first hit the budget, since it carries the same
  // shift as every boundary before it) — clamping only boundary `i` against
  // `budget` still lets the cascade push later boundaries past it.
  function clampedDelta(i: number, delta: number): number {
    const lowerBound = i === 0 ? 0 : boundaries[i - 1];
    const lastBoundary = boundaries[boundaries.length - 1];
    const room = budget - lastBoundary; // current unspent tail
    if (delta >= 0) return Math.min(delta, room);
    return Math.max(delta, lowerBound - boundaries[i]);
  }

  function moveDivider(i: number, delta: number) {
    const appliedDelta = clampedDelta(i, delta);
    const nextBoundaries = boundaries.map((b, j) => (j >= i ? b + appliedDelta : b));
    commitBoundaries(nextBoundaries);
  }

  function positionToDelta(clientX: number): number {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(fraction * budget);
  }

  function startDrag(i: number, pointerId: number, target: HTMLElement) {
    setDragIndex(i);
    target.setPointerCapture(pointerId);
  }

  function onDragMove(i: number, clientX: number) {
    const raw = positionToDelta(clientX);
    const appliedDelta = clampedDelta(i, raw - boundaries[i]);
    const nextBoundaries = boundaries.map((b, j) => (j >= i ? b + appliedDelta : b));
    commitBoundaries(nextBoundaries);
  }

  return (
    <div class={styles.root}>
      <div class={styles.track} ref={trackRef}>
        {pillars.map((p, i) => {
          const amount = value[p.id] ?? 0;
          const widthPct = budget === 0 ? 0 : (Math.max(0, amount) / budget) * 100;
          return (
            <div
              key={p.id}
              class={styles.segment}
              style={`--segment-width:${widthPct}%; --segment-index:${i}`}
              data-pillar={p.id}
            />
          );
        })}
        {unspent > 0 && (
          <div
            class={styles.tail}
            style={`--segment-width:${(unspent / budget) * 100}%`}
            aria-hidden="true"
          />
        )}

        {pillars.map((p, i) => {
          // The last divider always renders, even with no unspent tail right
          // now — it is the only way to pull energy back out of the last
          // pillar once the budget is fully spent, and a keyboard user has no
          // other path to that value.
          const leftPct = budget === 0 ? 0 : (boundaries[i] / budget) * 100;
          const lowerBound = i === 0 ? 0 : boundaries[i - 1];
          return (
            <div
              key={`divider-${p.id}`}
              class={styles.divider}
              style={`--divider-pos:${leftPct}%`}
              role="slider"
              tabIndex={0}
              aria-label={`Boundary after ${p.label}`}
              aria-valuemin={lowerBound}
              aria-valuemax={budget}
              aria-valuenow={boundaries[i]}
              data-dragging={dragIndex === i ? 'true' : undefined}
              onPointerDown={(e) => startDrag(i, e.pointerId, e.currentTarget)}
              onPointerMove={(e) => {
                if (dragIndex === i) onDragMove(i, e.clientX);
              }}
              onPointerUp={() => setDragIndex(null)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  moveDivider(i, -STEP);
                } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  moveDivider(i, STEP);
                } else if (e.key === 'Home') {
                  e.preventDefault();
                  moveDivider(i, -budget);
                } else if (e.key === 'End') {
                  e.preventDefault();
                  moveDivider(i, budget);
                }
              }}
            />
          );
        })}
      </div>

      <div class={styles.legend}>
        {pillars.map((p) => (
          <div key={p.id} class={styles.legendItem}>
            <span class={styles.legendSwatch} data-pillar={p.id} />
            <span class={styles.legendLabel}>{p.label}</span>
            <span class={styles.legendValue}>{Math.round(value[p.id] ?? 0)}</span>
          </div>
        ))}
        <div class={styles.legendItem}>
          <span class={`${styles.legendSwatch} ${styles.tailSwatch}`} />
          <span class={styles.legendLabel}>Unspent</span>
          <span class={styles.legendValue}>{Math.round(unspent)}</span>
        </div>
      </div>
    </div>
  );
}
