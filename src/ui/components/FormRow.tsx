// FormRow.tsx — Loop 6.2: a labelled field on a commission form (§15.8).
//
// Two shapes: `label + value` for a filed reading, and `label + control` (stacked)
// for a field the player fills in. Loop 6.7 builds the camp screen out of the
// stacked form.

import type { ComponentChildren } from 'preact';
import styles from './FormRow.module.css';

interface FormRowProps {
  label: string;
  /** The filed reading. Mono and tabular unless `prose`. */
  value?: ComponentChildren;
  /** Render the value in the body face — for names and verdicts, not data. */
  prose?: boolean;
  /** A control the player operates. Renders stacked under the label. */
  children?: ComponentChildren;
}

export function FormRow({ label, value, prose, children }: FormRowProps) {
  const classes = [styles.root, prose ? styles.prose : '', children ? styles.stacked : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div class={classes}>
      <span class={styles.label}>{label}</span>
      {value !== undefined && <span class={styles.value}>{value}</span>}
      {children && <div class={styles.control}>{children}</div>}
    </div>
  );
}
