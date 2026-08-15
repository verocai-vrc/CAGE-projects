// FlagChip.tsx — Loop 6.2: the chip geometry only. §15.5's five inline SVG flags
// and the sentinel lookup are Loop 6.3's build; this establishes the frame, the
// neutral fallback, and the accessible name so 6.3 is only artwork.
//
// The neutral field is deliberate, not a placeholder to be forgotten: §15.5 requires
// an explicit fallback for the `lab` and `fixture` sentinels rather than a broken
// glyph, so this hatched chip is the shipping appearance for those two values.

import styles from './FlagChip.module.css';

interface FlagChipProps {
  /** Free string per §4.2 — five real values plus the `lab`/`fixture` sentinels. */
  nationality: string;
  /** Show the nationality beside the chip. */
  showLabel?: boolean;
}

export function FlagChip({ nationality, showLabel }: FlagChipProps) {
  return (
    <span class={styles.root}>
      {/* Loop 6.3 replaces this span with an <svg><use href="#flag-…"/></svg>
          against the shared sprite defs block. */}
      <span class={`${styles.chip} ${styles.neutral}`} role="img" aria-label={nationality} />
      {showLabel && <span class={styles.label}>{nationality}</span>}
    </span>
  );
}
