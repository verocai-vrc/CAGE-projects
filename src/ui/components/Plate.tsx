// Plate.tsx — Loop 6.2: the broadcast lower-third (§15.8).
//
// Sheet's opposite number in The Broadcast. `corner` does not take a colour — it
// opts the plate into whatever corner identity an ancestor .corner-red /
// .corner-blue has established, so fight night threads red/blue through without a
// single component branching on which fighter it is drawing.

import type { ComponentChildren } from 'preact';
import styles from './Plate.module.css';

interface PlateProps {
  /** Display-face heading — a fighter name, a round number, a verdict. */
  title?: string;
  /** Mono caption above the title. */
  eyebrow?: string;
  /** Show the corner accent bar and tint the eyebrow with the corner's -text twin. */
  corner?: boolean;
  children?: ComponentChildren;
}

export function Plate({ title, eyebrow, corner, children }: PlateProps) {
  const classes = [styles.root, corner ? styles.cornered : ''].filter(Boolean).join(' ');

  return (
    <div class={classes}>
      {eyebrow && <span class={styles.eyebrow}>{eyebrow}</span>}
      {title && <p class={styles.title}>{title}</p>}
      {children && <div class={styles.body}>{children}</div>}
    </div>
  );
}
