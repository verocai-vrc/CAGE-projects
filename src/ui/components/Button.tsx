// Button.tsx — Loop 6.2: primary / ghost / stamp (§15.8).
//
// Takes no colour and no register. `primary` resolves through the register's
// --action pair rather than a corner colour, because a label on a corner fill
// fails AA (see Button.module.css and tokens.css).

import type { ComponentChildren, JSX } from 'preact';
import styles from './Button.module.css';

type ButtonVariant = 'primary' | 'ghost' | 'stamp';

// ButtonHTMLAttributes, not HTMLAttributes: `disabled` and `type` live on the
// former, and every screen needs both.
interface ButtonProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class'> {
  variant?: ButtonVariant;
  /** Fill the available width — for stacked choices and mobile layouts. */
  block?: boolean;
  children: ComponentChildren;
}

export function Button({ variant = 'ghost', block, children, type, ...rest }: ButtonProps) {
  const classes = [styles.root, styles[variant], block ? styles.block : ''].filter(Boolean).join(' ');

  return (
    <button type={type ?? 'button'} class={classes} {...rest}>
      {children}
    </button>
  );
}
