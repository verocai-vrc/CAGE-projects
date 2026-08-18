// PlateSprite.tsx — Loop 6.9: renders the six location backdrops as <symbol>
// elements into the shared defs block, same pattern as FaceSprite.tsx/
// WearSprite.tsx (DESIGN.md §15.6). Split into its own file — rather than
// living directly in Sprite.tsx like the flag symbols do — because
// tests/sprite.spec.ts's §15.5 budget (≤1.5KB) measures Sprite.tsx's own
// source text specifically for flag-identity cost; §15.6 gives plates their
// own separate ≤6KB budget, so they need to live outside that slice.
//
// Flat geometric silhouettes, entirely currentColor (no baked-in hex) so
// ScenePlate.module.css supplies both register treatments — duotone on
// paper, lit silhouette on black — from one geometry, per §15.6. Same
// simplification discipline as the flag symbols: legible as atmosphere at
// low opacity behind a header, not meant to be examined up close.

export function PlateSprite() {
  return (
    <>
      <symbol id="plate-gym" viewBox="0 0 200 120">
        {/* Squat rack: two uprights, a barbell resting on them, plate discs. */}
        <path d="M40 20v90M70 20v90" stroke="currentColor" stroke-width="4" fill="none" />
        <rect x="30" y="18" width="20" height="6" fill="currentColor" />
        <rect x="60" y="18" width="20" height="6" fill="currentColor" />
        <rect x="20" y="46" width="70" height="6" fill="currentColor" />
        <circle cx="24" cy="49" r="11" fill="currentColor" opacity=".8" />
        <circle cx="86" cy="49" r="11" fill="currentColor" opacity=".8" />
        {/* Heavy bag, hung right of the rack. */}
        <path d="M140 14v10" stroke="currentColor" stroke-width="3" />
        <path d="M128 24h24l6 50a18 32 0 0 1-36 0z" fill="currentColor" opacity=".7" />
      </symbol>

      <symbol id="plate-weigh-in" viewBox="0 0 200 120">
        {/* A commission scale: base, column, balance beam, two pans. */}
        <path d="M100 30v66" stroke="currentColor" stroke-width="4" />
        <path d="M76 96h48" stroke="currentColor" stroke-width="4" />
        <path d="M60 30h80" stroke="currentColor" stroke-width="3" />
        <path d="M62 30v4l-16 22h32z" fill="currentColor" opacity=".7" />
        <path d="M138 30v4l-16 22h32z" fill="currentColor" opacity=".7" />
        <circle cx="100" cy="30" r="4" fill="currentColor" />
      </symbol>

      <symbol id="plate-tunnel" viewBox="0 0 200 120">
        {/* A walkout corridor in one-point perspective, receding to a lit
            vanishing point. */}
        <path d="M0 0h200v120H0z M20 4h160v112H20z" fill="currentColor" opacity=".12" fill-rule="evenodd" />
        <path d="M0 0 70 46M200 0l-70 46M0 120l70-46M200 120l-70-46" stroke="currentColor" stroke-width="2" opacity=".55" />
        <rect x="70" y="46" width="60" height="28" fill="currentColor" opacity=".9" />
      </symbol>

      <symbol id="plate-cage" viewBox="0 0 200 120">
        {/* The cage fence: an octagon outline with a chain-link cross-hatch. */}
        <path
          d="M70 10h60l40 30v40l-40 30H70l-40-30V40z"
          stroke="currentColor"
          stroke-width="3"
          fill="none"
        />
        <path
          d="M40 40 160 90M40 90 160 40M70 10l60 100M130 10 70 110"
          stroke="currentColor"
          stroke-width="1"
          opacity=".35"
        />
      </symbol>

      <symbol id="plate-medical" viewBox="0 0 200 120">
        {/* A cross on a rounded field — the commission medical mark. */}
        <rect x="70" y="20" width="60" height="80" rx="10" fill="currentColor" opacity=".14" />
        <path d="M92 34h16v26h26v16h-26v26H92V76H66V60h26z" fill="currentColor" />
      </symbol>

      <symbol id="plate-home" viewBox="0 0 200 120">
        {/* A gable roofline over a lit window — the life-layer plate. */}
        <path d="M40 70 100 24l60 46" stroke="currentColor" stroke-width="4" fill="none" />
        <rect x="54" y="70" width="92" height="36" fill="currentColor" opacity=".16" />
        <rect x="88" y="80" width="24" height="26" fill="currentColor" opacity=".8" />
      </symbol>
    </>
  );
}
