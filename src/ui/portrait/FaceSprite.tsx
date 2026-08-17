// FaceSprite.tsx — Loop 6.4: renders features.ts's dictionary as <symbol>
// elements into the shared defs block (§15.4).
//
// Kept as its own component (imported once by ui/sprite/Sprite.tsx) rather than
// inlined there, so the face dictionary and the flag dictionary stay independently
// readable and independently measurable against their own budgets.
//
// Every path fills/strokes with currentColor. Portrait.tsx sets `color` per-layer
// via a wrapping element, which is what lets one set of symbols serve any skin
// tone or hair color without a symbol per combination.

import { FEATURE_LAYERS } from './features';

// `head` is an outline stroke of the jaw/skull over the skin fill, not a second
// filled shape — a filled head at full ink would occlude the skin tone entirely
// and paint every portrait black regardless of `skin`'s index. Every other slot
// (skin, hair, facialHair) is a genuine fill; `hairColor` has no shape of its own.
const STROKE_SLOTS = new Set(['head', 'brow', 'eyes', 'nose', 'mouth']);

export function FaceSprite() {
  return (
    <>
      {Object.entries(FEATURE_LAYERS).map(([slot, symbols]) =>
        symbols.map(({ id, d }) =>
          d ? (
            <symbol key={id} id={id} viewBox="0 0 64 64">
              {STROKE_SLOTS.has(slot) ? (
                <path d={d} stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" />
              ) : (
                <path d={d} fill="currentColor" />
              )}
            </symbol>
          ) : null,
        ),
      )}
    </>
  );
}
