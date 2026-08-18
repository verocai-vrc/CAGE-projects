// Portrait.tsx — Loop 6.4: §15.4's rendering contract. ~9 <use> elements against
// the shared symbol defs, zero raster bytes. Loop 6.6 adds an optional `wear`
// overlay — up to 4 more <use> elements (cauliflowerEar/browScarring draw one
// per severity step; noseBreak and swelling are single shapes) on top of the
// base face, never persisted, always passed in freshly computed by the caller
// (see ui/portrait/wear.ts).
//
// Layer order is fixed and matters: skin sits under head (the outline reads
// against the fill), hair sits over head, facial hair and the linework features
// sit on top. Most wear draws above everything — a scar or a broken nose reads
// on top of the feature it's marking. swelling is the one exception: it's a
// filled halo around the eye, not a mark on it, so it draws right after
// skin/head and BEFORE the eyes/brow linework — otherwise an opaque fill on
// top would cover the eye it's supposed to surround, reading as a blotch
// instead of puffiness. `hairColor` and `skin`'s own tone are not symbols —
// they recolor their layer via a CSS custom property.

import { parseFaceCode, type FaceCode } from './faceCode';
import { HAIR_COLORS, SKIN_TONES } from './features';
import { NO_WEAR, type WearLayers } from './wear';
import styles from './Portrait.module.css';

interface PortraitProps {
  /** A serialized FaceCode (Fighter.face) or a parsed one — either is accepted so
   *  callers holding a raw Fighter don't need to parse it themselves. */
  face: string | FaceCode;
  /** CSS length. Defaults to 64px via the --portrait-size custom property. */
  size?: string;
  /** Derived, never stored — omit for a debut/no-history portrait (identical
   *  to passing NO_WEAR). */
  wear?: WearLayers;
}

export function Portrait({ face, size, wear = NO_WEAR }: PortraitProps) {
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
        {wear.swelling > 0 && <use href={`#wr-swell-${wear.swelling}`} />}
        <use href={`#brow-${code.brow}`} />
        <use href={`#eyes-${code.eyes}`} />
        <use href={`#nose-${code.nose}`} />
        <use href={`#mouth-${code.mouth}`} />
        {code.facialHair > 0 && <use href={`#facialhair-${code.facialHair}`} />}
        {wear.cauliflowerEar > 0 && <use href={`#wr-ear-${wear.cauliflowerEar}`} />}
        {wear.browScarring > 0 && <use href={`#wr-brow-${wear.browScarring}`} />}
        {wear.noseBreak && <use href="#wr-nose-break" />}
        {wear.weathering > 0 && <use href={`#wr-weather-${wear.weathering}`} />}
      </svg>
    </div>
  );
}
