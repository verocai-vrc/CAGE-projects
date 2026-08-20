// coach.ts — Loop 7.9: the corner (DESIGN.md §16.8).
//
// §16.8 gives the coach three fields that each feed something later, and one
// that does work now:
//
//   `temperament` selects the corner's line pool (§16.7, Loop 7.14).
//   `acuity`      sets corner-advice quality alongside fightIQ (§16.7).
//   `background`  biases which tactic the coach reaches for, and supplies
//                 {GYM}-adjacent colour in the open beat (§16.6).
//
// None of those consumers exist yet — 7.14 and 7.15 build them. What this loop
// owes them is a coach that is *generated deterministically from the career
// seed*, because a corner whose temperament changed on reload would make the
// replayable narration §16.6 promises impossible. So the generator lands now,
// with the same fixed-draw discipline every other career-layer generator
// follows, and the line pools plug into it later.
//
// There are no authored anchor coaches the way there are anchor gyms: the
// amateur wrapper's prose names Ironside and Apex, but it has never named a
// coach, so nothing in the game is owed a specific one.

import type { RNG } from '../engine';
import { coachContent } from '../content';

export type CoachBackground = 'boxing' | 'wrestling' | 'bjj' | 'kickboxing' | 'allround';
export type CoachTemperament = 'calm' | 'furious' | 'analytical' | 'gambler';

export interface Coach {
  id: string;
  name: string;
  background: CoachBackground;
  temperament: CoachTemperament;
  acuity: number; // 0..100
}

interface TraitPart<T> {
  id: T;
  label: string;
  weight: number;
}

/** One weighted draw from a trait pool. Always consumes exactly one `next()`. */
function pickTrait<T>(parts: readonly TraitPart<T>[], rng: RNG): T {
  const total = parts.reduce((sum, part) => sum + part.weight, 0);
  let roll = rng.next() * total;
  for (const part of parts) {
    roll -= part.weight;
    if (roll <= 0) return part.id;
  }
  return parts[parts.length - 1].id;
}

/** The human-readable label for a background or temperament, for prose that
 *  needs to say it out loud ("a jiu-jitsu man", "the calm one"). Kept beside the
 *  ids so §16.6's beats read from content rather than hardcoding English. */
export function backgroundLabel(background: CoachBackground): string {
  return coachContent.backgrounds.find((part) => part.id === background)?.label ?? background;
}

export function temperamentLabel(temperament: CoachTemperament): string {
  return coachContent.temperaments.find((part) => part.id === temperament)?.label ?? temperament;
}

/**
 * A coach, drawn from a seeded stream.
 *
 * Exactly five draws on every path, so a caller's stream advances by a fixed
 * amount — the same discipline generateGym, nicknameFor, drawWeakness and
 * drawRecord follow. Adding a field to the coach must not be able to change the
 * gym generated after it in the same stream.
 *
 * `acuity` spans 25..95 rather than 0..100: a coach at 0 would be actively
 * sabotaging the fighter, which §16.7's corner-advice model has no way to
 * express and which reads as a bug rather than a bad corner. The floor is "not
 * much help", not "harmful".
 */
export function generateCoach(rng: RNG, idPrefix = 'coach'): Coach {
  const firstName = coachContent.firstNames[Math.floor(rng.next() * coachContent.firstNames.length)];
  const lastName = coachContent.lastNames[Math.floor(rng.next() * coachContent.lastNames.length)];
  const background = pickTrait(coachContent.backgrounds, rng);
  const temperament = pickTrait(coachContent.temperaments, rng);
  const acuity = Math.round(25 + rng.next() * 70);

  return {
    // Derived from the name rather than a sixth draw, so the fixed-draw count
    // above stays five and two coaches with the same name are the same id.
    id: `${idPrefix}-${`${firstName}-${lastName}`.toLowerCase()}`,
    name: `${firstName} ${lastName}`,
    background,
    temperament,
    acuity,
  };
}
