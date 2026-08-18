// Sprite.tsx — Loop 6.3: the shared SVG defs block, mounted once at app root.
//
// DESIGN.md §15.4: one hidden <svg> holds every symbol, and each consumer is a
// <use> referencing shared geometry. A slate of six opponents costs six <use>
// nodes per feature, not six copies of the path data. Loop 6.4's ~40 face feature
// paths join this same block.
//
// §15.5: flags are inline SVG, never emoji. Windows does not render regional
// indicator sequences (U+1F1E6-1F1FF), so an emoji flag renders as the bare letter
// pair on the primary development target. An emoji flag is a bug, not a shortcut.
//
// Geometry is simplified for legibility at 16 x 12 CSS pixels: Brazil keeps the
// green field, yellow lozenge and blue disc but gets no stars; the USA gets four
// red stripes and an empty canton rather than thirteen and fifty. At this size the
// detail would be sub-pixel mush either way.
//
// Paths rather than <rect> throughout, and short hex where it is exact: the sprite
// carries a 1.5KB budget and a field is 21 bytes as a path against 29 as a rect.

import { FaceSprite } from '../portrait/FaceSprite';
import { WearSprite } from '../portrait/WearSprite';
import styles from './Sprite.module.css';

export function Sprite() {
  return (
    <svg class={styles.sprite} aria-hidden="true">
      <defs>
        <FaceSprite />
        <WearSprite />
        <symbol id="flag-brazil" viewBox="0 0 24 18">
          <path fill="#009B3A" d="M0 0h24v18H0z" />
          <path fill="#FEDF00" d="m12 2.2 10 6.8-10 6.8L2 9z" />
          <circle cx="12" cy="9" r="3.5" fill="#002776" />
        </symbol>

        <symbol id="flag-ireland" viewBox="0 0 24 18">
          <path fill="#fff" d="M0 0h24v18H0z" />
          <path fill="#169B62" d="M0 0h8v18H0z" />
          <path fill="#FF883E" d="M16 0h8v18h-8z" />
        </symbol>

        <symbol id="flag-japan" viewBox="0 0 24 18">
          <path fill="#fff" d="M0 0h24v18H0z" />
          <circle cx="12" cy="9" r="5.2" fill="#BC002D" />
        </symbol>

        <symbol id="flag-poland" viewBox="0 0 24 18">
          <path fill="#fff" d="M0 0h24v18H0z" />
          <path fill="#DC143C" d="M0 9h24v9H0z" />
        </symbol>

        <symbol id="flag-usa" viewBox="0 0 24 18">
          <path fill="#fff" d="M0 0h24v18H0z" />
          <path fill="#B22234" d="M0 0h24v2.6H0zm0 5.2h24v2.6H0zm0 5.1h24v2.6H0zm0 5.1h24v2.6H0z" />
          <path fill="#3C3B6E" d="M0 0h10v9H0z" />
        </symbol>

        {/* The explicit fallback §15.5 requires for the lab/fixture sentinels.
            currentColor, not a fixed grey, so it takes the register's secondary
            ink on paper and secondary bone on arena black from one symbol. */}
        <symbol id="flag-neutral" viewBox="0 0 24 18">
          <path
            d="M-1 7 7-1M1 17 17 1M13 19 25 7"
            stroke="currentColor"
            stroke-width="1.6"
            opacity=".45"
          />
        </symbol>
      </defs>
    </svg>
  );
}
