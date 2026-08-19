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
//
// ---------------------------------------------------------------------------
// HEAD SPACE. Every path in this file is authored against one anatomy, so the
// slots compose without per-combination fixups:
//
//     y 11-12   crown
//     y 22-26   hairline
//     y 27-29   brow line          (wear draws brow scarring at y 27.5-31.5)
//     y 33-34   eye line           (wear draws swelling around x 39, y 33-38)
//     y 30-39   ear                (wear draws cauliflower ear at x 14-19.6 / 44.4-49.6)
//     y 34-41   nose               (wear draws the break at x 33-34.5, y 36-41)
//     y 44      mouth
//     y 38-46   cheek/jaw plane    (wear draws weathering here)
//     y 50-54   chin
//     y 50+     neck and shoulders
//     x 17-47   widest span (temples), so the ears attach for EVERY head variant
//
// The last line is the load-bearing one: the five head shapes differ in jaw and
// cranium, never in maximum width. That is both more anatomically honest than
// scaling the whole skull and what lets one shared ear/neck/shoulder frame sit
// behind all five without a per-head variant of its own.
// ---------------------------------------------------------------------------

import { SLOT_COUNTS, SLOT_ORDER, type FaceCode } from './faceCode';

export interface FeatureSymbol {
  id: string;
  /** Path data in the shared 0 0 64 64 viewBox. */
  d: string;
  /** Stroked slots only. Defaults to 1.6 — the base linework weight. */
  strokeWidth?: number;
}

// --- the shared frame: ears, neck, shoulders ---------------------------------
// Not a slot. Drawn once per portrait BENEATH the head silhouette, in the same
// skin/outline treatment, which is what turns a floating oval into a headshot:
// the jaw overlaps the neck, and each ear shows only the crescent that falls
// outside the skull. Kept as one path (three subpaths) rather than three symbols
// because nothing ever renders an ear without the neck.
//
// The ears sit just inside the cauliflower-ear overlay's footprint on purpose —
// wear is a swelling OF the ear, so it has to read as the same feature getting
// thicker, not as a new shape appearing next to it.
export const FACE_FRAME: FeatureSymbol = {
  id: 'face-frame',
  d:
    'M6 64c1-8.5 8-12.5 19.5-14.5 2-.4 2.5-1 2.5-3V38h8v8.5c0 2 .5 2.6 2.5 3C50 51.5 57 55.5 58 64z' +
    'M18.5 31c-2.6-.4-4 1.2-4 3.5s1.4 3.9 4 3.5z' +
    'M45.5 31c2.6-.4 4 1.2 4 3.5s-1.4 3.9-4 3.5z',
};

// --- skin (6): tone only, no geometry of its own -----------------------------
// The skin layer used to carry six rectangles that were filled underneath a
// differently-shaped head outline — a square jaw poking out from under a rounded
// one, which is most of what made the old portraits read as buckets. A face has
// exactly one silhouette, so HEAD now owns it and is filled with the skin tone
// and stroked with ink in a single <use> (see Portrait.tsx). `skin` is therefore
// a pure tone slot, exactly like `hairColor`.

/**
 * `skin`'s index selects a tone, applied by Portrait.tsx as a CSS custom property
 * exactly like HAIR_COLORS — six respectful, visibly distinct tones. This slot
 * draws no geometry; it recolours the silhouette HEAD supplies.
 */
export const SKIN_TONES = ['#4A3021', '#6B4226', '#8D5A34', '#B07C4F', '#D2A679', '#EFCBA3'] as const;

/**
 * The linework colour for each tone: the silhouette outline, and every feature
 * drawn on top of it. Indexed 1:1 with SKIN_TONES.
 *
 * This table exists because a single ink for all six tones cannot work. Contrast
 * against a fill is (Llighter + 0.05) / (Ldarker + 0.05), and that 0.05 floor
 * dominates at the dark end: near-black linework on SKIN_TONES[0] measures
 * 1.2:1 — brow, eyes, nose and mouth all disappear, and the ink outline around
 * the silhouette closes the whole portrait into one dark blob. Measured against
 * their own tone, these six all land between 2.4:1 and 4.0:1, so a face reads at
 * 32px on any of them.
 *
 * The two darkest tones therefore take a LIGHTER line and the rest take a darker
 * one. That crossover is deliberate: holding contrast roughly constant across the
 * ramp matters more than holding the direction constant, and light-on-dark
 * linework is ordinary practice in flat illustration rather than a compromise.
 * Dropping the dark end of the ramp instead was never an option worth weighing.
 *
 * The two light lines are pitched lower (~2.3:1) than the four dark ones (~3.3:1)
 * and warm rather than neutral. Matched at the same ratio they came out pale and
 * grey, and light grey brows on a brown face read as paint rather than as
 * linework; a warm ochre at lower contrast reads as the same skin in shadow.
 *
 * Note these are absolute colours, not register tokens — unlike everything else
 * in §15.2. A face is the same face on paper and on arena black; it is the one
 * element in the system whose palette belongs to the subject rather than to the
 * surface it is printed on.
 */
export const SKIN_LINES = ['#8C643B', '#AC7945', '#2A170A', '#513117', '#6B4623', '#8A5F35'] as const;

// --- head (5): the whole silhouette — filled with skin, stroked with ink -----
// Closed paths, authored crown-first down each side to the chin. All five reach
// x 17-47 at the temples (see the head-space note above) and vary where a face
// actually varies: jaw width, chin length, cranium roundness.
const HEAD: FeatureSymbol[] = [
  // oval — the neutral one
  { id: 'head-0', d: 'M32 52c-8 0-14.5-6-14.5-14.5V30C17.5 20 24 13 32 13s14.5 7 14.5 17v7.5C46.5 46 40 52 32 52z' },
  // square — broad jaw, flat chin
  { id: 'head-1', d: 'M24 51.5c-4.2-2-6.5-6.5-6.5-13.5v-8C17.5 20 24 13 32 13s14.5 7 14.5 17v8c0 7-2.3 11.5-6.5 13.5z' },
  // long — narrow, chin carried lower
  { id: 'head-2', d: 'M32 53.5c-7.5 0-14.5-7-14.5-16v-8C17.5 19.5 24 12 32 12s14.5 7.5 14.5 17.5v8c0 9-7 16-14.5 16z' },
  // round — wide cheeks, short chin
  { id: 'head-3', d: 'M32 50.5c-9 0-15-6-15-14v-6C17 21 24 13.5 32 13.5s15 7.5 15 16.5v6c0 8-6 14-15 14z' },
  // tapered — high cheekbones into a narrow chin
  { id: 'head-4', d: 'M32 52.5c-6.5 0-11.5-5-14-13.5l-.5-9.5C17 20 24 13 32 13s15.5 7 14.5 16.5l-.5 9.5c-2.5 8.5-7.5 13.5-14 13.5z' },
];

// --- hair (10): drawn above head, includes bald as a real variant -----------
// Every shape is authored to overlap the crown by a couple of units so no head
// variant leaves a bald gap between skull and hairline. The old set was drawn in
// y 4-24 against a skull that started at y 17, which is why it read as a handle
// floating over a bucket.
const HAIR: FeatureSymbol[] = [
  { id: 'hair-0', d: '' }, // bald — an empty layer is the tenth variant, not a gap
  // buzz — a tight cap, hairline flat and low
  { id: 'hair-1', d: 'M17 24.5c0-8.5 6.5-13.5 15-13.5s15 5 15 13.5z' },
  // crop — cap with a softened, slightly uneven hairline
  { id: 'hair-2', d: 'M17 25c0-9 6.5-14 15-14s15 5 15 14l-4-2c-3 1-8 1.5-11 1.5s-8-.5-11-1.5z' },
  // flat top — boxed high fade
  { id: 'hair-3', d: 'M18 24v-7c0-4.5 6-7.5 14-7.5s14 3 14 7.5v7z' },
  // slicked back — thick at the temples, thin over the crown
  { id: 'hair-4', d: 'M17.5 26c-1-10 6-15 14.5-15s15.5 5 14.5 15l-2-6c-1-4-6-6-12.5-6s-11.5 2-12.5 6z' },
  // afro — volume that reads wider than the skull
  { id: 'hair-5', d: 'M17 25.5c-2.5-2.5-3.5-5.5-3.5-9C13.5 9 21 5.5 32 5.5s18.5 3.5 18.5 11c0 3.5-1 6.5-3.5 9z' },
  // long — cap plus two lengths falling past the jaw
  { id: 'hair-6', d: 'M17 24c0-9 6.5-14 15-14s15 5 15 14v20l-4.5-1.5V28c0-5-4.5-8.5-10.5-8.5s-10.5 3.5-10.5 8.5v14.5L17 44z' },
  // topknot — swept back into a bun
  { id: 'hair-7', d: 'M28 11.5c-6 1.5-9.5 5.5-9.5 11V25h27v-2.5c0-5.5-3.5-9.5-9.5-11 2-1 3-2.5 3-4C39 5.5 36 4 32 4s-7 1.5-7 3.5c0 1.5 1 3 3 4z' },
  // mohawk — the sides stay skin, which is the point
  { id: 'hair-8', d: 'M27.5 25v-9c0-6 2-10 4.5-10s4.5 4 4.5 10v9z' },
  // widow's peak — receding at the temples, a point at the centre
  { id: 'hair-9', d: 'M18.5 25.5c-.5-9 5.5-14.5 13.5-14.5s14 5.5 13.5 14.5l-2.5-.5c-1-5-3-8-5.5-8-2 0-3.5 1.5-5.5 4.5-2-3-3.5-4.5-5.5-4.5-2.5 0-4.5 3-5.5 8z' },
];

// --- brow (5): a pair of strokes on the brow line ---------------------------
// Widened to match the eye spacing below them (each eye spans ~6 units, one eye
// width apart). The old pair was 6 units total and sat closer to the nose than
// to the temple, which read as a frown at every size.
const BROW: FeatureSymbol[] = [
  { id: 'brow-0', d: 'M24.2 28h6.2M33.6 28h6.2' },
  { id: 'brow-1', d: 'M24.2 26.9l6.2 1.6M39.8 26.9l-6.2 1.6' }, // angled in — menacing
  { id: 'brow-2', d: 'M24.2 28.5q3.1-2.4 6.2 0M33.6 28.5q3.1-2.4 6.2 0' }, // arched
  { id: 'brow-3', d: 'M24.2 28.2h6.2M33.6 28.2h6.2', strokeWidth: 2.6 }, // heavy
  { id: 'brow-4', d: 'M24.2 27.6l6.2-1.3M39.8 27.6l-6.2-1.3' }, // raised at the inner end
];

// --- eyes (6): an upper lid over a pupil, per side ---------------------------
// The pupil is a zero-length segment: with stroke-linecap="round" it renders as a
// dot exactly one stroke-width across, which is a pupil for the price of four
// characters and no second fill path. A lid line above it is the whole difference
// between "two dots" and "a pair of eyes" at 32px.
const EYES: FeatureSymbol[] = [
  { id: 'eyes-0', d: 'M24.6 33.2q2.9-2.6 5.8 0M33.6 33.2q2.9-2.6 5.8 0M27.4 34.3h.2M36.4 34.3h.2' },
  { id: 'eyes-1', d: 'M24.6 33.6q2.9-1.4 5.8 0M33.6 33.6q2.9-1.4 5.8 0M27.4 34.5h.2M36.4 34.5h.2' }, // narrow
  { id: 'eyes-2', d: 'M24.6 33.6q2.9-3 5.8 0q-2.9 3-5.8 0M33.6 33.6q2.9-3 5.8 0q-2.9 3-5.8 0M27.4 33.6h.2M36.4 33.6h.2' }, // wide
  { id: 'eyes-3', d: 'M24.4 32.8q3-1.2 5.9.4M39.6 32.8q-3-1.2-5.9.4M27.4 34.3h.2M36.4 34.3h.2' }, // hooded
  { id: 'eyes-4', d: 'M24.6 33.8q2.9 1.6 5.8 0M33.6 33.8q2.9 1.6 5.8 0' }, // closed
  { id: 'eyes-5', d: 'M25.2 33.4q2.4-2 4.8 0M34.2 33.4q2.4-2 4.8 0M27.6 34.2h.2M36.2 34.2h.2', strokeWidth: 1.4 }, // deep set
];

// --- nose (5): the lower bridge into a nostril, centred on x 32 --------------
// The nose starts BELOW the eye line, never level with it. Drawn from y 34 — where
// the bridge actually begins between the eyes — it reads as a beak running down
// the middle of the face at every size, which was the single loudest defect in the
// first pass. It begins at y 36 and lands on the base at y 40, leaving the
// eye-to-nose gap a face needs to look like a face.
const NOSE: FeatureSymbol[] = [
  { id: 'nose-0', d: 'M32.4 36.8v3q-.2 1-2.2.8', strokeWidth: 1.4 }, // straight
  { id: 'nose-1', d: 'M32.2 37v2.4M29.8 40.2q2.4 1.2 4.8 0', strokeWidth: 1.4 }, // wide
  { id: 'nose-2', d: 'M31.8 36.6c1 1.4 1.3 2.8 1.2 3.9q-.2.8-2.2.6', strokeWidth: 1.4 }, // hooked
  { id: 'nose-3', d: 'M32.2 37.8v1.8q-.2 1-2 .8', strokeWidth: 1.4 }, // short
  { id: 'nose-4', d: 'M32.6 36.8l-.7 1.8.7 1.6q-.2 1-2.4.8', strokeWidth: 1.4 }, // broad bridge
];

// --- mouth (5): centred on x 32, drawn over any facial hair ------------------
// Narrower and lighter than the brow above it. At the base 1.6 weight a 9-unit
// mouth reads as a filled slot rather than a line.
const MOUTH: FeatureSymbol[] = [
  { id: 'mouth-0', d: 'M28 44.4h8', strokeWidth: 1.4 },
  { id: 'mouth-1', d: 'M28 44.1q4 1.6 8 0', strokeWidth: 1.4 }, // set, corners down
  { id: 'mouth-2', d: 'M28 44.9q4-1.6 8 0', strokeWidth: 1.4 }, // grim
  { id: 'mouth-3', d: 'M28 44.4q4-1.4 8 0q-4 2.2-8 0', strokeWidth: 1.4 }, // full
  { id: 'mouth-4', d: 'M28.4 43.9h7.2M30 46h4', strokeWidth: 1.3 }, // thin, lower lip shown
];

// --- facialHair (6): filled, in the hair colour, drawn UNDER the mouth -------
// Under the mouth on purpose: a beard that covers the mouth line erases a
// feature the player chose. Drawn beneath it, the mouth reads as a mouth inside
// a beard, which is what a beard looks like.
const FACIAL_HAIR: FeatureSymbol[] = [
  { id: 'facialhair-0', d: '' }, // clean-shaven
  // goatee
  { id: 'facialhair-1', d: 'M28.2 45.8q3.8 1.8 7.6 0l.6 3.8q-4.2 2.2-8.8 0z' },
  // full beard — jaw plane down past the chin
  { id: 'facialhair-2', d: 'M19.6 36.4c0 11.2 5.6 18 12.4 18s12.4-6.8 12.4-18c-2.4 3.8-7 5.6-12.4 5.6s-10-1.8-12.4-5.6z' },
  // moustache — thin, and clear of the mouth line below it, or the two stack into
  // a single dark bar across the middle of the face
  { id: 'facialhair-3', d: 'M26.8 40.9q5.2-1.8 10.4 0l-.4 1.7q-4.8-1.5-9.6 0z' },
  // boxed beard — chin and jaw only, no cheek. A uniform-width ring following the
  // jaw OUTSIDE the silhouette (the obvious way to draw a chinstrap) reads as the
  // strap of a helmet rather than as hair, especially in the lighter hair colours.
  { id: 'facialhair-4', d: 'M21.5 41c1.5 7 5.5 11.5 10.5 11.5S40.5 48 42 41c-2 2.5-6 4-10 4s-8.5-1.5-10.5-4z' },
  // full beard and moustache
  { id: 'facialhair-5', d: 'M19.6 36.4c0 11.2 5.6 18 12.4 18s12.4-6.8 12.4-18c-2.4 3.8-7 5.6-12.4 5.6s-10-1.8-12.4-5.6zM26.8 40.6q5.2-1.8 10.4 0l-.5 2.2q-4.7-1.7-9.4 0z' },
];

export const FEATURE_LAYERS: Record<keyof FaceCode, FeatureSymbol[]> = {
  skin: [], // tone only — see SKIN_TONES
  head: HEAD,
  hair: HAIR,
  hairColor: [], // not drawn geometry — see HAIR_COLORS
  brow: BROW,
  eyes: EYES,
  nose: NOSE,
  mouth: MOUTH,
  facialHair: FACIAL_HAIR,
};

/**
 * hairColor is not a shape — it recolors the hair and facial-hair layers. Five
 * values, applied by Portrait.tsx as a CSS custom property rather than as a tenth
 * symbol per hairstyle, which would multiply the hair count by five for no visual
 * gain.
 */
export const HAIR_COLORS = ['#2B1B12', '#4A2E1D', '#8A5A2B', '#C9A24A', '#1A1A1A'] as const;

/**
 * What each variant is called, for the portrait editor's field values (§15.4's
 * "who's in the mirror"). Indexed 1:1 with the dictionaries above, and asserted
 * against SLOT_COUNTS alongside them — a reordered or added variant with a stale
 * name is a lie the player reads directly, so the two cannot be allowed to drift.
 *
 * EVERY slot is named, including the two tone slots, even though the editor shows
 * those as a colour swatch rather than as text. Two reasons, and the second is the
 * load-bearing one:
 *
 *   * a swatch needs an accessible name, and "the third one" is not one.
 *   * §9.1's no-numbers rule is enforced against the chargen DOM as "no digit
 *     anywhere in the step's text", screen-reader text included. A positional
 *     fallback like "option 3 of 6" trips it. Naming every variant means the
 *     editor never has a reason to count out loud.
 *
 * The skin ramp is named for its position on a lightness scale rather than with
 * evocative words. Naming skin tones is a thing character creators reliably get
 * wrong, and "Deeper / Deep / Medium" says what the swatch shows without reaching
 * for a metaphor.
 */
export const FEATURE_LABELS = {
  skin: ['Deepest', 'Deeper', 'Deep', 'Medium', 'Light', 'Lightest'],
  hairColor: ['Black brown', 'Dark brown', 'Brown', 'Blond', 'Black'],
  head: ['Oval', 'Square', 'Long', 'Round', 'Tapered'],
  hair: ['Shaved', 'Buzz', 'Crop', 'Flat top', 'Swept back', 'Afro', 'Long', 'Topknot', 'Mohawk', 'Receding'],
  brow: ['Level', 'Angled', 'Arched', 'Heavy', 'Raised'],
  eyes: ['Even', 'Narrow', 'Wide', 'Hooded', 'Closed', 'Deep set'],
  nose: ['Straight', 'Wide', 'Hooked', 'Short', 'Broad'],
  mouth: ['Level', 'Set', 'Grim', 'Full', 'Thin'],
  facialHair: ['Clean', 'Goatee', 'Full beard', 'Moustache', 'Boxed beard', 'Full set'],
} as const satisfies Record<keyof FaceCode, readonly string[]>;

// Every slot in the dictionary must supply exactly the count faceCode.ts expects,
// checked here so the two files cannot silently drift apart. `skin` and `hairColor`
// are the two count-only slots with no path array — they select a tone, and are
// checked against their colour tables instead.
const TONE_ONLY: Partial<Record<keyof FaceCode, readonly string[]>> = {
  skin: SKIN_TONES,
  hairColor: HAIR_COLORS,
};

for (const slot of SLOT_ORDER) {
  const expected = SLOT_COUNTS[slot];
  const actual = (TONE_ONLY[slot] ?? FEATURE_LAYERS[slot]).length;
  if (actual !== expected) {
    throw new Error(
      `features.ts: slot '${slot}' has ${actual} variants but faceCode.ts declares ${expected}`,
    );
  }
  // Every variant must be named, tone slots included — see FEATURE_LABELS.
  const named = FEATURE_LABELS[slot].length;
  if (named !== expected) {
    throw new Error(`features.ts: slot '${slot}' has ${named} labels but needs ${expected}`);
  }
}
