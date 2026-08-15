// Stamp.tsx — Loop 6.2: the rubber-stamp mark (§15.8).
//
// RESOLVED, RETIRED, SUSPENDED, DAILY · <date>. Uses --mark-text rather than the
// raw --mark for the glyphs so it stays legible if a register ever binds --mark to
// a fill-only colour (§15.2).

import type { ComponentChildren } from 'preact';
import styles from './Stamp.module.css';

interface StampProps {
  /** Commission blue ink instead of vermilion. */
  tone?: 'mark' | 'blue';
  /** No rotation, mono face — for a stamp that sits inline in a run of text. */
  flat?: boolean;
  children: ComponentChildren;
}

export function Stamp({ tone = 'mark', flat, children }: StampProps) {
  const classes = [styles.root, tone === 'blue' ? styles.blue : '', flat ? styles.flat : '']
    .filter(Boolean)
    .join(' ');

  return <span class={classes}>{children}</span>;
}
