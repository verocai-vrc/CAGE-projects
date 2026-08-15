// Meter.tsx — Loop 6.2: the labelled 0–100 bar, replacing HudBar (§15.8).
//
// Two things distinguish it from what it replaces. It takes no colour: the fill
// resolves through --corner-fill (set by a .corner-red / .corner-blue ancestor) and
// falls back to the register's --mark, so the same props render red on fight night
// for the player, blue for the opponent, and stamped ink on a camp form. And the
// number is mono and tabular with a reserved column width, so a meter counting
// 100 → 99 → 9 does not shift its own label around (§15.3).

import styles from './Meter.module.css';

interface MeterProps {
  label: string;
  value: number;
  max?: number;
  /** `warn` is §15.2's amber: rocked, gassed, injured. */
  tone?: 'default' | 'warn';
}

export function Meter({ label, value, max = 100, tone = 'default' }: MeterProps) {
  // The readout, the bar and aria-valuenow all report the same clamped number. An
  // out-of-range value is caller error, and letting it through would print a
  // reading the bar contradicts and an aria-valuenow outside aria-valuemax.
  const clamped = Math.max(0, Math.min(max, value));
  const shown = Math.round(clamped);
  const pct = max === 0 ? 0 : (clamped / max) * 100;
  const classes = tone === 'warn' ? `${styles.root} ${styles.warn}` : styles.root;

  return (
    <div class={classes}>
      <div class={styles.head}>
        <span class={styles.label}>{label}</span>
        <span class={styles.value}>{shown}</span>
      </div>
      <div
        class={styles.trough}
        role="meter"
        aria-label={label}
        aria-valuenow={shown}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        {/* The only thing crossing the JS/CSS boundary is the datum. The width
            rule that consumes it lives in the module, not here. */}
        <div class={styles.fill} style={`--meter-fill:${pct}%`} />
      </div>
    </div>
  );
}
