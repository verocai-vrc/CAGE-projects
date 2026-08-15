// Sheet.tsx — Loop 6.2: a filed form section (§15.8).
//
// The three variants are the real NCR triplicate colours: white stock, the
// goldenrod carbon copy, and the pink sheet that §15.2 reserves for medical and
// suspension. Loop 6.7 uses `carbon` for the next week's blank form sitting under
// the resolved one.

import type { ComponentChildren } from 'preact';
import styles from './Sheet.module.css';

type SheetVariant = 'white' | 'carbon' | 'medical';

interface SheetProps {
  variant?: SheetVariant;
  /** Display-face heading for the form section. */
  title?: string;
  /** Mono caption to the right of the title — a form number, a date, a week. */
  caption?: string;
  children: ComponentChildren;
}

const VARIANT_CLASS: Record<SheetVariant, string> = {
  white: '',
  carbon: styles.carbon,
  medical: styles.medical,
};

export function Sheet({ variant = 'white', title, caption, children }: SheetProps) {
  const classes = [styles.root, VARIANT_CLASS[variant]].filter(Boolean).join(' ');

  return (
    <section class={classes}>
      {(title || caption) && (
        <div class={styles.head}>
          {title && <h2 class={styles.title}>{title}</h2>}
          {caption && <span class={styles.caption}>{caption}</span>}
        </div>
      )}
      {children}
    </section>
  );
}
