// features.ts — Loop 6.4: the feature path dictionary behind DESIGN.md §15.4's
// procedural portraits.
//
// One <symbol> per (slot, variant) pair, rendered later as a flat stack of <use>
// elements by Portrait.tsx (§15.4: "~9 <use> elements against shared geometry").
// All paths share one 64x64 head-space viewBox so they compose without per-slot
// transforms, and every stroke/fill is `currentColor` so a single portrait can be
// recolored (skin tone, hair tone) by wrapping each layer's <use> in a <g> with a
// CSS custom property — Portrait.tsx does that; this file only draws shapes.
//
// The counts here MUST match faceCode.ts's SLOT_COUNTS — asserted at module load,
// not just by authoring discipline, so the two files cannot silently drift apart.

import { SLOT_COUNTS, SLOT_ORDER, type FaceCode } from './faceCode';

export interface FeatureSymbol {
  id: string;
  /** Path data in the shared 0 0 64 64 viewBox. */
  d: string;
}

// --- skin (6): head-shape base fills, drawn as the bottom layer -------------
// The shapes are identical to HEAD's silhouette family on purpose — skin is the
// filled base a head outline sits on top of, not a different face shape.
const SKIN: FeatureSymbol[] = [
  { id: 'skin-0', d: 'M20 20h24v30H20z' },
  { id: 'skin-1', d: 'M19 19h26v29H19z' },
  { id: 'skin-2', d: 'M21 18h22v33H21z' },
  { id: 'skin-3', d: 'M18 21h28v27H18z' },
  { id: 'skin-4', d: 'M20 17h24v34H20z' },
  { id: 'skin-5', d: 'M22 20h20v31H22z' },
];

/**
 * `skin`'s index also selects a tone, applied by Portrait.tsx as a CSS custom
 * property exactly like HAIR_COLORS — six respectful, visibly distinct tones
 * rather than one default fill with tone bolted on as an afterthought. Index order
 * matches SKIN above 1:1 (skin-N uses SKIN_TONES[N]).
 */
export const SKIN_TONES = ['#4A3021', '#6B4226', '#8D5A34', '#B07C4F', '#D2A679', '#EFCBA3'] as const;

// --- head (5): jaw/skull outline, drawn over skin ----------------------------
const HEAD: FeatureSymbol[] = [
  { id: 'head-0', d: 'M20 20h24v22a12 10 0 0 1-24 0z' },
  { id: 'head-1', d: 'M19 19h26v20a13 14 0 0 1-26 0z' },
  { id: 'head-2', d: 'M21 18h22v25a11 8 0 0 1-22 0z' },
  { id: 'head-3', d: 'M18 21h28v18a14 12 0 0 1-28 0z' },
  { id: 'head-4', d: 'M20 17h24v27a12 11 0 0 1-24 0z' },
];

// --- hair (10): drawn above head, includes bald/buzzed as real variants -----
const HAIR: FeatureSymbol[] = [
  { id: 'hair-0', d: '' }, // bald — an empty layer is the tenth variant, not a gap
  { id: 'hair-1', d: 'M18 22c0-9 6-14 14-14s14 5 14 14h-4c0-6-4-10-10-10s-10 4-10 10z' },
  { id: 'hair-2', d: 'M17 20c1-10 8-16 15-16s14 6 15 16l-4 1c-1-8-6-13-11-13s-10 5-11 13z' },
  { id: 'hair-3', d: 'M18 12h28v9H18z' },
  { id: 'hair-4', d: 'M19 10c0-2 3-3 13-3s13 1 13 3v8h-2c-1-4-3-6-11-6s-10 2-11 6h-2z' },
  { id: 'hair-5', d: 'M16 24c-2-12 7-20 16-20s18 8 16 20l-3-1c1-9-6-16-13-16s-14 7-13 16z' },
  { id: 'hair-6', d: 'M19 9h26v6H19zm-2 6h30v3H17z' },
  { id: 'hair-7', d: 'M20 8c4-2 20-2 24 0 2 1 2 5 0 7-2-4-6-5-12-5s-10 1-12 5c-2-2-2-6 0-7z' },
  { id: 'hair-8', d: 'M18 18v-3c0-8 6-13 14-13s14 5 14 13v3l-3-1c0-7-5-11-11-11s-11 4-11 11z' },
  { id: 'hair-9', d: 'M16 9h32v5H16zm3 5h26v3H19z' },
];

// --- brow (5): a short pair of strokes above the eye line -------------------
const BROW: FeatureSymbol[] = [
  { id: 'brow-0', d: 'M25 30h6M33 30h6' },
  { id: 'brow-1', d: 'M24 29h7l-1 2h-6zM33 29h7l-1 2h-6z' },
  { id: 'brow-2', d: 'M24 31l7-2M33 29l7 2' },
  { id: 'brow-3', d: 'M25 28h6v2h-6zM33 28h6v2h-6z' },
  { id: 'brow-4', d: 'M23 30q4-3 8 0M33 30q4-3 8 0' },
];

// --- eyes (6): a symmetric pair per variant ----------------------------------
const EYES: FeatureSymbol[] = [
  { id: 'eyes-0', d: 'M26 34a2 2 0 1 0 4 0 2 2 0 1 0-4 0zM34 34a2 2 0 1 0 4 0 2 2 0 1 0-4 0z' },
  { id: 'eyes-1', d: 'M25 34h5v1.4h-5zM34 34h5v1.4h-5z' },
  { id: 'eyes-2', d: 'M25 34l5 1-5 1zM39 34l-5 1 5 1z' },
  { id: 'eyes-3', d: 'M26 33a3 2 0 1 0 6 0 3 2 0 1 0-6 0zM32 33a3 2 0 1 0 6 0 3 2 0 1 0-6 0z' },
  { id: 'eyes-4', d: 'M25 35h5M34 35h5' },
  { id: 'eyes-5', d: 'M26 34a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0zM35 34a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0z' },
];

// --- nose (5): a single centered mark ----------------------------------------
const NOSE: FeatureSymbol[] = [
  { id: 'nose-0', d: 'M32 36l-2 5h4z' },
  { id: 'nose-1', d: 'M32 35v6M30 41h4' },
  { id: 'nose-2', d: 'M31 35c-2 2-2 5 0 6h2c2-1 2-4 0-6z' },
  { id: 'nose-3', d: 'M33 35l-3 6h5z' },
  { id: 'nose-4', d: 'M32 36v4M31 40h2' },
];

// --- mouth (5): a single centered horizontal mark ----------------------------
const MOUTH: FeatureSymbol[] = [
  { id: 'mouth-0', d: 'M27 45h10' },
  { id: 'mouth-1', d: 'M27 45q5 2 10 0' },
  { id: 'mouth-2', d: 'M27 45q5-2 10 0' },
  { id: 'mouth-3', d: 'M27 44h10v2h-10z' },
  { id: 'mouth-4', d: 'M28 45h8M30 47h4' },
];

// --- facialHair (6): includes clean-shaven as a real variant ----------------
const FACIAL_HAIR: FeatureSymbol[] = [
  { id: 'facialhair-0', d: '' }, // clean-shaven
  { id: 'facialhair-1', d: 'M28 47c1 2 6 2 7 0l1 3q-4.5 2-9 0z' }, // goatee
  { id: 'facialhair-2', d: 'M22 42q10 8 20 0l1 3q-11 9-22 0z' }, // full beard
  { id: 'facialhair-3', d: 'M25 37h4v2h-4zM35 37h4v2h-4z' }, // mustache only
  { id: 'facialhair-4', d: 'M20 38q3 12 12 13v-2q-7-1-9-11zM44 38q-3 12-12 13v-2q7-1 9-11z' }, // sideburns
  { id: 'facialhair-5', d: 'M25 37h14v2h-14zM21 40q4 10 11 11v-2q-6-1-8-9zM43 40q-4 10-11 11v-2q6-1 8-9z' }, // full + mustache
];

export const FEATURE_LAYERS: Record<keyof FaceCode, FeatureSymbol[]> = {
  skin: SKIN,
  head: HEAD,
  hair: HAIR,
  hairColor: [], // not drawn geometry — see HAIR_COLOR below
  brow: BROW,
  eyes: EYES,
  nose: NOSE,
  mouth: MOUTH,
  facialHair: FACIAL_HAIR,
};

/**
 * hairColor is not a shape — it recolors the hair layer. Five values, applied by
 * Portrait.tsx as a CSS custom property on the hair <use>'s wrapper rather than as
 * a tenth symbol per hairstyle, which would multiply the hair count by five for no
 * visual gain.
 */
export const HAIR_COLORS = ['#2B1B12', '#4A2E1D', '#8A5A2B', '#C9A24A', '#1A1A1A'] as const;

// Every slot in the dictionary must supply exactly the count faceCode.ts expects,
// checked here so the two files cannot silently drift apart. hairColor is the one
// count-only slot with no path array — checked against HAIR_COLORS instead.
for (const slot of SLOT_ORDER) {
  const expected = SLOT_COUNTS[slot];
  const actual = slot === 'hairColor' ? HAIR_COLORS.length : FEATURE_LAYERS[slot].length;
  if (actual !== expected) {
    throw new Error(
      `features.ts: slot '${slot}' has ${actual} variants but faceCode.ts declares ${expected}`,
    );
  }
}
