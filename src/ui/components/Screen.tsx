// Screen.tsx — Loop 6.1: the layout primitive every screen roots in.
//
// DESIGN.md §15.1 splits the game into two registers with opposite emotional
// treatments. §15.2 makes register selection a class on the screen root —
// never a media query, never a per-component prop. This component is the only
// place that class is applied, which is what makes the rule enforceable: a
// component deep inside the tree reads `var(--text)` and gets ink on paper or
// bone on black depending on which screen it happens to be rendered under, with
// no branch of its own.

import type { ComponentChildren } from 'preact';
import { ScenePlate } from './ScenePlate';
import type { ScenePlateName } from '../sprite/scenePlates';
import styles from './Screen.module.css';

/** The File is paperwork; The Broadcast is fight night. §15.1. */
export type Register = 'file' | 'broadcast';

interface ScreenProps {
  register: Register;
  /** Kept for the existing `#screen-id` hooks the Playwright driver selects on. */
  id?: string;
  /** Small administrative caption above the title — mono, tracked, uppercase. */
  eyebrow?: string;
  /** Rendered as the screen's `h1` in the display face. */
  title?: string;
  /** Opt out of the max-width column. The lab report is the only intended user. */
  wide?: boolean;
  /**
   * A location backdrop, low-opacity, behind the header only (§15.6) — never
   * behind the body content below it, so it can never sit under dense data.
   */
  plate?: ScenePlateName;
  children: ComponentChildren;
}

const REGISTER_CLASS: Record<Register, string> = {
  file: 'reg-file',
  broadcast: 'reg-broadcast',
};

export function Screen({ register, id, eyebrow, title, wide, plate, children }: ScreenProps) {
  const classes = [
    styles.root,
    REGISTER_CLASS[register],
    // §15.1: The File is a light document on a dark desk. The Broadcast is lit
    // figures on arena black — no document, the ground goes edge to edge.
    register === 'file' ? styles.document : '',
    wide ? styles.wide : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div id={id} class={classes}>
      <div class={styles.column}>
        {(title || eyebrow) && (
          <header class={styles.header}>
            {plate && <ScenePlate plate={plate} />}
            {eyebrow && <span class={styles.eyebrow}>{eyebrow}</span>}
            {title && <h1 class={styles.title}>{title}</h1>}
          </header>
        )}
        {children}
      </div>
    </div>
  );
}
