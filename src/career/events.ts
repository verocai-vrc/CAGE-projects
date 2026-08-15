// events.ts — Loop 4.5: the life event deck (DESIGN.md §12's ~60-event cap,
// §1 pillar 3's "templated variety over authored volume"). Deck draw is a
// pure, seeded no-repeat pick over content/events/life.json's pool;
// resolution folds one chosen option's effects into CareerState. Both take
// the pool/rng as parameters (matchmaking.ts's pattern), so this file stays
// decoupled from /content and reusable by M5's daily seeded deck (Loop 5.1
// derives that day's rng from the date string and feeds it straight in here).

import type { RNG } from '../engine';
import type { LifeEvent, LifeEventOption } from '../state/schema';
import type { CareerState } from '../state/store';

function clamp100(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export interface DrawResult {
  event: LifeEvent;
  seenEventIds: string[];
}

// Draws one event the player hasn't already seen this career. A ~60-event
// pool comfortably outlasts a single 20-40 minute run, but once every event
// has been seen, the seen-list resets and the full pool becomes eligible
// again rather than the deck running dry on a very long run.
export function drawLifeEvent(
  pool: readonly LifeEvent[],
  seenEventIds: readonly string[],
  rng: RNG,
): DrawResult {
  const seen = new Set(seenEventIds);
  const unseen = pool.filter((event) => !seen.has(event.id));
  const eligible = unseen.length > 0 ? unseen : pool;
  const priorSeen = unseen.length > 0 ? seenEventIds : [];

  const event = eligible[Math.floor(rng.next() * eligible.length)];
  return { event, seenEventIds: [...priorSeen, event.id] };
}

// Pure: folds one chosen option's effects into career state. Life bars and
// hype stay clamped 0..100 (the career-layer convention throughout, e.g.
// life.ts/progression.ts); purse is floored at 0 so a costly choice can't
// send it negative.
export function resolveLifeEventChoice(career: CareerState, option: LifeEventOption): CareerState {
  const effects = option.effects;

  const lifeBars = {
    trainingPartners: clamp100(career.lifeBars.trainingPartners + (effects.lifeBars?.trainingPartners ?? 0)),
    partner: clamp100(career.lifeBars.partner + (effects.lifeBars?.partner ?? 0)),
    sponsors: clamp100(career.lifeBars.sponsors + (effects.lifeBars?.sponsors ?? 0)),
  };
  const hype = clamp100(career.hype + (effects.hype ?? 0));
  const purse = Math.max(0, career.purse + (effects.purse ?? 0));
  const player =
    career.player && effects.health
      ? {
          ...career.player,
          condition: { ...career.player.condition, health: clamp100(career.player.condition.health + effects.health) },
        }
      : career.player;

  return { ...career, lifeBars, hype, purse, player };
}
