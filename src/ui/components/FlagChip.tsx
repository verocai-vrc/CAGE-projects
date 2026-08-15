// FlagChip.tsx — Loop 6.2 built the geometry; Loop 6.3 fills it with §15.5's
// inline SVG flags.
//
// Never an emoji flag: Windows does not render regional indicator sequences
// (U+1F1E6-1F1FF), so an emoji flag shows as the bare letter pair on the primary
// development target. The symbols live in the shared defs block
// (ui/sprite/Sprite.tsx) and each chip is a single <use>.
//
// The lookup is total — the `lab` and `fixture` sentinels, and any nationality
// added to the name pools before its flag is drawn, resolve to the neutral field
// rather than a broken glyph.

import { flagSymbolId } from '../sprite/flags';
import styles from './FlagChip.module.css';

interface FlagChipProps {
  /** Free string per §4.2 — five real values plus the `lab`/`fixture` sentinels. */
  nationality: string;
  /** Show the nationality beside the chip. */
  showLabel?: boolean;
}

export function FlagChip({ nationality, showLabel }: FlagChipProps) {
  const symbol = flagSymbolId(nationality);

  return (
    <span class={styles.root}>
      <svg class={styles.chip} viewBox="0 0 24 18" role="img" aria-label={nationality}>
        <use href={`#${symbol}`} />
      </svg>
      {showLabel && <span class={styles.label}>{nationality}</span>}
    </span>
  );
}
