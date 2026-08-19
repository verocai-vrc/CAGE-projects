// FighterIdentity.tsx — Loop 6.3 built the corner bar, name, flag, record and
// archetype (DESIGN.md §15.5). Loop 6.4 fills the portrait slot with the real
// procedural face (§15.4) — the empty div reserved in 6.3 is now a <Portrait>, so
// nothing here reflows relative to that loop.
//
// Loop 7.4 closes the gap Loop 6.3 left open (§16.5). The record used to be an
// optional prop sourced from CareerState, so only the player had one and an
// opponent's slot rendered empty. `record` is now a field on Fighter, seeded and
// ladder-scaled for generated opponents, so both sides render through the same
// path and the component takes no record prop at all.

import type { Fighter, FightRecord } from '../../engine/types';
import { archetypes } from '../../content';
import { FlagChip } from './FlagChip';
import { Portrait } from '../portrait/Portrait';
import styles from './FighterIdentity.module.css';

interface FighterIdentityProps {
  fighter: Fighter;
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

function formatRecord(record: FightRecord): string {
  const base = `${record.wins}-${record.losses}-${record.draws}`;
  return record.noContests > 0 ? `${base} (${record.noContests} NC)` : base;
}

export function FighterIdentity({ fighter, corner, compact }: FighterIdentityProps) {
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
      {/* Loop 7.7 (§16.4): stance comes off the Fighter, never off the FaceCode.
          This is the component that always holds a real one, so a southpaw is
          drawn squared the other way everywhere a fighter is named. */}
      <Portrait face={fighter.face} stance={fighter.stance} size={compact ? '32px' : '48px'} />
      <div class={styles.body}>
        <div class={styles.nameRow}>
          <FlagChip nationality={fighter.nationality} />
          <span class={styles.name}>{fighter.name}</span>
        </div>
        {/* Loop 7.6: absent for the ~35% who have no nickname (§16.5) — rendered
            conditionally rather than as an empty node, so the block closes up
            instead of leaving a gap where a handle would be. */}
        {fighter.nickname !== null && <div class={styles.nickname}>“{fighter.nickname}”</div>}
        <div class={styles.meta}>
          <span class={styles.record}>{formatRecord(fighter.record)}</span>
          <span class={styles.archetype}>{archetypeLabel}</span>
        </div>
      </div>
    </div>
  );
}
