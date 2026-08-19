// wearFeatures.ts — Loop 6.6: the overlay geometry faceWear's layers render
// as. Same 0-0-64-64 headspace as features.ts, same currentColor contract, so
// wear composes over any FaceCode with no per-face-shape adjustment. IDs use
// a `wr-` prefix per DESIGN.md §16.4's later note that marks and wear must
// never share a namespace — reserving it now costs nothing and avoids a
// rename when marks land in Loop 7.7.
//
// Each layer is indexed by its own severity (0 = the un-drawn baseline, never
// rendered) rather than being a single on/off shape, since faceWear's whole
// point is that the SAME layer reads differently at different points in a
// career.

export interface WearSymbol {
  id: string;
  d: string;
  strokeWidth?: number;
}

// --- cauliflowerEar (1-2): drawn at the ear position, outside the head
// silhouette (head spans x 17-47) — a real cauliflower ear is a swelling of
// the outer ear, so it has to sit past the jaw line to read at this size.
// Filled ellipses, not strokes — an outline this small reads as a stray mark,
// a small filled lobe reads as an ear.
const CAULIFLOWER_EAR: WearSymbol[] = [
  { id: 'wr-ear-1', d: 'M17 30a2.6 3.6 0 1 0 0 8 2.6 3.6 0 1 0 0-8zM47 30a2.6 3.6 0 1 0 0 8 2.6 3.6 0 1 0 0-8z' },
  { id: 'wr-ear-2', d: 'M16.5 28a3.4 4.6 0 1 0 0 10 3.4 4.6 0 1 0 0-10zM47.5 28a3.4 4.6 0 1 0 0 10 3.4 4.6 0 1 0 0-10z' },
];

// --- browScarring (1-3): short marks through the brow line (brow sits at
// y 28-31) — each step adds one more scar rather than lengthening a single one,
// so the accumulation reads as distinct fights rather than one long scratch.
const BROW_SCARRING: WearSymbol[] = [
  { id: 'wr-brow-1', d: 'M27 27.5l2 4', strokeWidth: 0.8 },
  { id: 'wr-brow-2', d: 'M27 27.5l2 4M36 28l1.5 3.5', strokeWidth: 0.8 },
  { id: 'wr-brow-3', d: 'M27 27.5l2 4M36 28l1.5 3.5M30 27l1 4', strokeWidth: 0.8 },
];

// --- noseBreak: a single kink off the nose's centerline (nose sits at
// x 30-34, y 35-41) rather than a redraw of the whole feature, so it reads on
// top of any of the five nose variants.
const NOSE_BREAK: WearSymbol[] = [{ id: 'wr-nose-break', d: 'M33 36l1.5 5', strokeWidth: 1.1 }];

// --- swelling (1-2): puffiness around one eye's OUTER corner (the right eye
// — eyes-0's second circle centers at x36,y34; the eye socket runs to about
// x39) — transient, so it is drawn as a soft filled shape rather than a
// linework mark. Kept small and pushed toward the temple (away from the nose
// at x30-34) so it reads as a puffy brow/cheekbone around the eye rather than
// bleeding into the nose and looking like a shadow across the whole face.
const SWELLING: WearSymbol[] = [
  { id: 'wr-swell-1', d: 'M39 33.5a3.2 2.4 0 1 0 0 4.8 3.2 2.4 0 1 0 0-4.8z' },
  { id: 'wr-swell-2', d: 'M39.5 32.5a4.2 3.2 0 1 0 0 6.4 4.2 3.2 0 1 0 0-6.4z' },
];

// --- weathering (1-3): the lines a face gains from career length alone,
// independent of any specific fight's result. Drawn where a face actually
// creases — crow's feet at the outer eye corners first, then a second pair
// above them, then the nasolabial folds running from the nose past the mouth.
//
// NOT horizontal dashes across the mid-cheek: that was the first pass, and a
// row of parallel ticks either side of the nose reads as whiskers, not age.
// Creases follow the muscles that make them, so these run diagonally away from
// the features they hang off.
const WEATHERING: WearSymbol[] = [
  { id: 'wr-weather-1', d: 'M22.6 36.2l-1.6 1.8M41.4 36.2l1.6 1.8', strokeWidth: 0.7 },
  {
    id: 'wr-weather-2',
    d: 'M22.6 36.2l-1.6 1.8M41.4 36.2l1.6 1.8M22.2 33.6l-1.8 1M41.8 33.6l1.8 1',
    strokeWidth: 0.7,
  },
  {
    id: 'wr-weather-3',
    d:
      'M22.6 36.2l-1.6 1.8M41.4 36.2l1.6 1.8M22.2 33.6l-1.8 1M41.8 33.6l1.8 1' +
      'M28.6 40.8q-1.6 2.6-1.2 5M35.4 40.8q1.6 2.6 1.2 5',
    strokeWidth: 0.7,
  },
];

export const WEAR_LAYERS = {
  cauliflowerEar: CAULIFLOWER_EAR,
  browScarring: BROW_SCARRING,
  noseBreak: NOSE_BREAK,
  swelling: SWELLING,
  weathering: WEATHERING,
};
