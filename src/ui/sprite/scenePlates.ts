// scenePlates.ts — Loop 6.9: the scene-plate name → symbol id lookup
// (DESIGN.md §15.6). Geometry lives in Sprite.tsx's defs block, same split
// as flags.ts (a lookup module) vs. the symbols themselves.

/** Symbol ids present in the sprite defs block. */
export const SCENE_PLATES = ['gym', 'weigh-in', 'tunnel', 'cage', 'medical', 'home'] as const;

export type ScenePlateName = (typeof SCENE_PLATES)[number];

export function scenePlateSymbolId(plate: ScenePlateName): string {
  return `plate-${plate}`;
}
