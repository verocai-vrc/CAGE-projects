// daily.ts — Loop 5.1: seeded daily run (DESIGN.md §8.5, §11). Everyone on
// the same date gets the same prospect + event deck. A single RNG derived
// from the date string is threaded through both origin.ts's skip-path
// generator and events.ts's deck draw, in that fixed order, so the whole
// setup collapses to one reproducible function of the date alone — no
// separate seed for each part.

import { mulberry32, seedFromString, type RNG } from '../engine';
import type { Origin } from '../engine/types';
import type { AmateurMoment, LifeEvent } from '../state/schema';
import { drawLifeEvent } from './events';
import { rollRandomOrigin } from './origin';

export function dailyRng(dateString: string): RNG {
  return mulberry32(seedFromString(dateString));
}

export interface DailySetup {
  origin: Origin;
  eventDeckOrder: string[]; // LifeEvent ids, in draw order
}

// Pure given the content pools: derives the day's origin and lays out the
// full event-deck draw order in advance. `deckSize` defaults to one full
// pass of the pool (deck-of-cards semantics: draw every card once before any
// repeat) — comfortably more than a single run's camp weeks will consume.
export function buildDailySetup(
  dateString: string,
  moments: readonly AmateurMoment[],
  eventPool: readonly LifeEvent[],
  deckSize: number = eventPool.length,
): DailySetup {
  const rng = dailyRng(dateString);
  const origin = rollRandomOrigin(moments, rng);

  const eventDeckOrder: string[] = [];
  let seenEventIds: string[] = [];
  for (let i = 0; i < deckSize; i++) {
    const draw = drawLifeEvent(eventPool, seenEventIds, rng);
    eventDeckOrder.push(draw.event.id);
    seenEventIds = draw.seenEventIds;
  }

  return { origin, eventDeckOrder };
}
