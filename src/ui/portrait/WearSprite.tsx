// WearSprite.tsx — Loop 6.6: renders wearFeatures.ts's overlay dictionary as
// <symbol> elements into the shared defs block, same pattern as FaceSprite.tsx
// for the base features. Most layers stroke with currentColor — wear reads as
// ink/scarring against the face. cauliflowerEar and swelling are filled
// instead: both are small rounded lobes where an outline at this size would
// read as a stray mark rather than a shape (see wearFeatures.ts's comments).

import { WEAR_LAYERS } from './wearFeatures';

const FILLED_SLOTS = new Set(['cauliflowerEar', 'swelling']);

export function WearSprite() {
  return (
    <>
      {Object.entries(WEAR_LAYERS).map(([slot, symbols]) =>
        symbols.map(({ id, d, strokeWidth }) => (
          <symbol key={id} id={id} viewBox="0 0 64 64">
            {FILLED_SLOTS.has(slot) ? (
              <path d={d} fill="currentColor" opacity="0.55" />
            ) : (
              <path d={d} stroke="currentColor" stroke-width={strokeWidth ?? 1} stroke-linecap="round" fill="none" opacity="0.7" />
            )}
          </symbol>
        )),
      )}
    </>
  );
}
