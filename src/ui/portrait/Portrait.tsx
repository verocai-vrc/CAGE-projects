// Portrait.tsx — Loop 6.4: §15.4's rendering contract. ~9 <use> elements against
// the shared symbol defs, zero raster bytes.
//
// Layer order is fixed and matters: skin sits under head (the outline reads
// against the fill), hair sits over head, facial hair and the linework features
// sit on top. `hairColor` and `skin`'s own tone are not symbols — they recolor
// their layer via a CSS custom property, which is why this component renders 8
// <use> elements (one per drawn slot; hairColor has none of its own) rather than 9.

import { parseFaceCode, type FaceCode } from './faceCode';
import { HAIR_COLORS, SKIN_TONES } from './features';
import styles from './Portrait.module.css';

interface PortraitProps {
  /** A serialized FaceCode (Fighter.face) or a parsed one — either is accepted so
   *  callers holding a raw Fighter don't need to parse it themselves. */
  face: string | FaceCode;
  /** CSS length. Defaults to 64px via the --portrait-size custom property. */
  size?: string;
}

export function Portrait({ face, size }: PortraitProps) {
  const code = typeof face === 'string' ? parseFaceCode(face) : face;

  return (
    <div class={styles.root} style={size ? `--portrait-size:${size}` : undefined}>
      <svg class={styles.svg} viewBox="0 0 64 64">
        <g class={styles.skin} style={`color:${SKIN_TONES[code.skin]}`}>
          <use href={`#skin-${code.skin}`} />
        </g>
        <use href={`#head-${code.head}`} />
        {code.hair > 0 && (
          <g class={styles.hair} style={`color:${HAIR_COLORS[code.hairColor]}`}>
            <use href={`#hair-${code.hair}`} />
          </g>
        )}
        <use href={`#brow-${code.brow}`} />
        <use href={`#eyes-${code.eyes}`} />
        <use href={`#nose-${code.nose}`} />
        <use href={`#mouth-${code.mouth}`} />
        {code.facialHair > 0 && <use href={`#facialhair-${code.facialHair}`} />}
      </svg>
    </div>
  );
}
