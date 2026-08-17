// FighterIdentity.tsx — Loop 6.3 built the corner bar, name, flag, record and
// archetype (DESIGN.md §15.5). Loop 6.4 fills the portrait slot with the real
// procedural face (§15.4) — the empty div reserved in 6.3 is now a <Portrait>, so
// nothing here reflows relative to that loop.
//
// ONE GAP REMAINS, documented in DEVELOPMENT_LOOPS.md Loop 6.3:
//
// `record` is optional, and an opponent has none. `generateOpponent` produces no
// record at all, and the player's lives on CareerState rather than on Fighter, so
// there is nothing to render for an opponent that would not be invented. Loop 7.4
// puts `record` on Fighter and single-sources it; until then the slot stays empty
// rather than showing a fabricated 0-0-0, which would read as a debutant and
// mislead the player about who they are being matched with.

import type { Fighter } from '../../engine/types';
import type { CareerRecord } from '../../state/store';
import { archetypes } from '../../content';
import { FlagChip } from './FlagChip';
import { Portrait } from '../portrait/Portrait';
import styles from './FighterIdentity.module.css';

interface FighterIdentityProps {
  fighter: Fighter;
  /**
   * The player's record, from career state. Omitted for opponents until Loop 7.4 —
   * see the note above.
   */
  record?: CareerRecord;
  /**
   * Corner assignment. Unlike the register (§15.2), this is fighter data rather
   * than styling — which fighter is in the red corner is a fact about the bout —
   * so it is a prop, and it sets the global corner class every descendant reads.
   *
   * Setting it also draws the corner bar. Omit it inside a surface that already
   * carries the corner (a Plate on fight night) so the rule is not drawn twice;
   * the identity still inherits the colour from that ancestor.
   */
  corner?: 'red' | 'blue';
  compact?: boolean;
}

function formatRecord(record: CareerRecord): string {
  const base = `${record.wins}-${record.losses}-${record.draws}`;
  return record.noContests > 0 ? `${base} (${record.noContests} NC)` : base;
}

export function FighterIdentity({ fighter, record, corner, compact }: FighterIdentityProps) {
  const archetypeLabel =
    archetypes.find((a) => a.id === fighter.archetype)?.label ?? fighter.archetype;

  const classes = [
    styles.root,
    compact ? styles.compact : '',
    corner ? `${styles.cornered} corner-${corner}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div class={classes}>
      <Portrait face={fighter.face} size={compact ? '32px' : '48px'} />
      <div class={styles.body}>
        <div class={styles.nameRow}>
          <FlagChip nationality={fighter.nationality} />
          <span class={styles.name}>{fighter.name}</span>
        </div>
        <div class={styles.meta}>
          {record && <span class={styles.record}>{formatRecord(record)}</span>}
          <span class={styles.archetype}>{archetypeLabel}</span>
        </div>
      </div>
    </div>
  );
}
