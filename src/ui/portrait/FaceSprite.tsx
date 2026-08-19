// FaceSprite.tsx — Loop 6.4: renders features.ts's dictionary as <symbol>
// elements into the shared defs block (§15.4).
//
// Kept as its own component (imported once by ui/sprite/Sprite.tsx) rather than
// inlined there, so the face dictionary and the flag dictionary stay independently
// readable and independently measurable against their own budgets.
//
// Three treatments, because a face is three kinds of drawing:
//
//   SILHOUETTE (head, face-frame) — no fill/stroke attribute at all. `fill` and
//     `stroke` are inherited SVG properties, so leaving them off lets the <use>
//     site set both from CSS: skin tone inside, ink outline around, one element.
//     That is what keeps the skull, ears and neck a single continuous shape
//     instead of a fill and an outline that can disagree about where the jaw is.
//   STROKE (brow, eyes, nose, mouth) — linework, at the slot's own weight.
//   FILL (hair, facialHair) — masses, recoloured by the hair-colour layer.

import { FACE_FRAME, FEATURE_LAYERS, type FeatureSymbol } from './features';

const STROKE_SLOTS = new Set(['brow', 'eyes', 'nose', 'mouth']);
const SILHOUETTE_SLOTS = new Set(['head']);

function symbolFor(slot: string, { id, d, strokeWidth }: FeatureSymbol) {
  if (!d) return null;
  return (
    <symbol key={id} id={id} viewBox="0 0 64 64">
      {SILHOUETTE_SLOTS.has(slot) ? (
        <path d={d} />
      ) : STROKE_SLOTS.has(slot) ? (
        <path d={d} stroke="currentColor" stroke-width={strokeWidth ?? 1.6} stroke-linecap="round" fill="none" />
      ) : (
        <path d={d} fill="currentColor" />
      )}
    </symbol>
  );
}

export function FaceSprite() {
  return (
    <>
      {symbolFor('head', FACE_FRAME)}
      {Object.entries(FEATURE_LAYERS).map(([slot, symbols]) =>
        symbols.map((symbol) => symbolFor(slot, symbol)),
      )}
    </>
  );
}
