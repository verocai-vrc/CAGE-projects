// TaleOfTheTape.tsx — Loop 6.8: the pre-fight comparison (§15.7, §15.8).
// A Plate-based row grid — name/stance/weight class plus the four derived
// pillars, fighter A's column tinted red and fighter B's blue via
// --corner-text (never --corner-fill: this is type, §15.2). FightScreen's
// own render of this (Loop 6.8) is the static standing reference; Loop
// 6.10's Walkout renders a second, `animated` copy for the "ticks in row by
// row" beat, staggered per row via CSS animation-delay — a prop rather than
// a fork, so both call sites share one component.

import { Fragment } from 'preact';
import { Plate } from './Plate';
import type { Fighter } from '../../engine/types';
import type { Pillars } from '../../engine/round';
import styles from './TaleOfTheTape.module.css';

interface TaleOfTheTapeProps {
  fighterA: Fighter;
  fighterB: Fighter;
  pillarsA: Pillars;
  pillarsB: Pillars;
  /** Stagger rows in row-by-row, per §15.7's walkout beat 5. Off by default —
   *  FightScreen's standing reference renders instantly. */
  animated?: boolean;
}

interface Row {
  label: string;
  a: string | number;
  b: string | number;
}

function rows(fighterA: Fighter, fighterB: Fighter, pillarsA: Pillars, pillarsB: Pillars): Row[] {
  return [
    { label: 'Name', a: fighterA.name, b: fighterB.name },
    { label: 'Stance', a: fighterA.stance, b: fighterB.stance },
    { label: 'Weight class', a: fighterA.weightClass, b: fighterB.weightClass },
    { label: 'Striking', a: Math.round(pillarsA.striking), b: Math.round(pillarsB.striking) },
    { label: 'Grappling', a: Math.round(pillarsA.grappling), b: Math.round(pillarsB.grappling) },
    { label: 'Durability', a: Math.round(pillarsA.durability), b: Math.round(pillarsB.durability) },
    { label: 'Mind', a: Math.round(pillarsA.mind), b: Math.round(pillarsB.mind) },
  ];
}

export function TaleOfTheTape({ fighterA, fighterB, pillarsA, pillarsB, animated }: TaleOfTheTapeProps) {
  const allRows = rows(fighterA, fighterB, pillarsA, pillarsB);
  return (
    <Plate eyebrow="Tale of the tape">
      <div class={`${styles.grid} ${animated ? styles.animated : ''}`}>
        {allRows.map((row, i) => (
          <Fragment key={row.label}>
            <span class={styles.rowLabel} style={animated ? `--row-index:${i}` : undefined}>
              {row.label}
            </span>
            <span
              class={`${styles.value} ${styles.valueA} corner-red`}
              style={animated ? `--row-index:${i}` : undefined}
            >
              {row.a}
            </span>
            <span class={styles.vs} style={animated ? `--row-index:${i}` : undefined}>
              vs
            </span>
            <span
              class={`${styles.value} ${styles.valueB} corner-blue`}
              style={animated ? `--row-index:${i}` : undefined}
            >
              {row.b}
            </span>
          </Fragment>
        ))}
      </div>
    </Plate>
  );
}
