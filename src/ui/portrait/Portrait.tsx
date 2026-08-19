// Portrait.tsx — Loop 6.4: §15.4's rendering contract. ~9 <use> elements against
// the shared symbol defs, zero raster bytes. Loop 6.6 adds an optional `wear`
// overlay — up to 4 more <use> elements (cauliflowerEar/browScarring draw one
// per severity step; noseBreak and swelling are single shapes) on top of the
// base face, never persisted, always passed in freshly computed by the caller
// (see ui/portrait/wear.ts).
//
// Layer order is fixed and matters:
//
//   frame       ears, neck, shoulders — UNDER the skull, so the jaw overlaps the
//               neck and each ear shows only the crescent outside the silhouette
//   head        the whole silhouette, filled with the skin tone and stroked with
//               ink in one element (see FaceSprite's SILHOUETTE treatment)
//   swelling    the one wear layer that draws early: it is a filled halo AROUND
//               the eye, not a mark on it, so drawing it on top would cover the
//               eye it is meant to surround and read as a blotch
//   linework    brow, eyes, nose
//   facialHair  under the mouth — a beard that covers the mouth line erases a
//               feature the player chose
//   mouth
//   hair        over the skull, in the hair colour facial hair also uses
//   wear        everything else draws last: a scar or a broken nose reads on top
//               of the feature it is marking
//
// `skin` and `hairColor` are not symbols — they recolor their layer via a CSS
// custom property, which is why one dictionary serves every tone combination.

import { parseFaceCode, type FaceCode } from './faceCode';
import { HAIR_COLORS, SKIN_LINES, SKIN_TONES } from './features';
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
      <svg
        class={styles.svg}
        viewBox="0 0 64 64"
        style={`--skin:${SKIN_TONES[code.skin]};--skin-line:${SKIN_LINES[code.skin]}`}
      >
        <use class={styles.silhouette} href="#face-frame" />
        <use class={styles.silhouette} href={`#head-${code.head}`} />
        {wear.swelling > 0 && <use href={`#wr-swell-${wear.swelling}`} />}
        <use href={`#brow-${code.brow}`} />
        <use href={`#eyes-${code.eyes}`} />
        <use href={`#nose-${code.nose}`} />
        <g class={styles.hair} style={`color:${HAIR_COLORS[code.hairColor]}`}>
          {code.facialHair > 0 && <use href={`#facialhair-${code.facialHair}`} />}
        </g>
        <use href={`#mouth-${code.mouth}`} />
        {code.hair > 0 && (
          <g class={styles.hair} style={`color:${HAIR_COLORS[code.hairColor]}`}>
            <use href={`#hair-${code.hair}`} />
          </g>
        )}
        {wear.cauliflowerEar > 0 && <use href={`#wr-ear-${wear.cauliflowerEar}`} />}
        {wear.browScarring > 0 && <use href={`#wr-brow-${wear.browScarring}`} />}
        {wear.noseBreak && <use href="#wr-nose-break" />}
        {wear.weathering > 0 && <use href={`#wr-weather-${wear.weathering}`} />}
      </svg>
    </div>
  );
}
