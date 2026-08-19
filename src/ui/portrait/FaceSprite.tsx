// FaceSprite.tsx — Loop 6.4: renders features.ts's dictionary as <symbol>
// elements into the shared defs block (§15.4).
//
// Kept as its own component (imported once by ui/sprite/Sprite.tsx) rather than
// inlined there, so the face dictionary and the flag dictionary stay independently
// readable and independently measurable against their own budgets.
//
// Three treatments, because a face is three kinds of drawing:
//
//   BARE (head, face-frame, build, marks) — no fill/stroke attribute at all.
//     `fill` and `stroke` are inherited SVG properties, so leaving them off lets
//     the <use> site set both from CSS: skin tone inside, ink outline around,
//     one element. That is what keeps the skull, ears, neck and shoulders a
//     single continuous shape instead of a fill and an outline that can disagree
//     about where the jaw is. `marks` joins them in Loop 7.7 for the same
//     reason from the other direction — it needs stroke without fill, and a
//     bare path lets Portrait.module.css say so in one place.
//   STROKE (brow, eyes, nose, mouth) — linework, at the slot's own weight.
//   FILL (hair, facialHair) — masses, recoloured by the hair-colour layer.

import { FACE_FRAME, FEATURE_LAYERS, type FeatureSymbol } from './features';

const STROKE_SLOTS = new Set(['brow', 'eyes', 'nose', 'mouth']);
const BARE_SLOTS = new Set(['head', 'build', 'marks']);

// Loop 7.7: `<g>` rather than `<symbol viewBox="0 0 64 64">`.
//
// Every entry in this dictionary was authored against the one 64x64 head space
// (see features.ts), and every <use> of it sits inside a <svg viewBox="0 0 64
// 64"> with no width/height of its own — so the nested viewport a <symbol>
// establishes was scaling the coordinate system onto an identical coordinate
// system. It rendered correctly and cost 23 bytes per entry to do nothing:
// `<symbol id="x" viewBox="0 0 64 64">…</symbol>` against `<g id="x">…</g>`.
//
// Across the face and wear dictionaries that is ~1.4KB of §15.9's 14KB inline-SVG
// budget spent on boilerplate, which is most of what Loop 7.7's extension needed.
// A <g> inside <defs> referenced by <use> is the ordinary idiom for exactly this
// — shared geometry in a fixed coordinate system — and is what should have been
// here from Loop 6.4. Verified by screenshot, not by reading the spec.
function symbolFor(slot: string, { id, d, strokeWidth }: FeatureSymbol) {
  if (!d) return null;
  return (
    <g key={id} id={id}>
      {BARE_SLOTS.has(slot) ? (
        <path d={d} />
      ) : STROKE_SLOTS.has(slot) ? (
        <path d={d} stroke="currentColor" stroke-width={strokeWidth ?? 1.6} stroke-linecap="round" fill="none" />
      ) : (
        <path d={d} fill="currentColor" />
      )}
    </g>
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
