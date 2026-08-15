import { describe, expect, it } from 'vitest';
import { buildDailySetup } from '../src/career/daily';
import { amateurMoments, lifeEvents } from '../src/content';
import { OriginSchema } from '../src/state/schema';

describe('buildDailySetup', () => {
  it('is byte-identical for the same date string run twice', () => {
    const first = buildDailySetup('2026-08-15', amateurMoments, lifeEvents);
    const second = buildDailySetup('2026-08-15', amateurMoments, lifeEvents);
    expect(first).toEqual(second);
  });

  it('produces a schema-valid Origin', () => {
    const { origin } = buildDailySetup('2026-08-15', amateurMoments, lifeEvents);
    expect(OriginSchema.safeParse(origin).success).toBe(true);
  });

  it('produces an event deck order drawing every pool event exactly once by default', () => {
    const { eventDeckOrder } = buildDailySetup('2026-08-15', amateurMoments, lifeEvents);
    expect(eventDeckOrder).toHaveLength(lifeEvents.length);
    expect(new Set(eventDeckOrder).size).toBe(lifeEvents.length);
  });

  it('different date strings produce different prospects and different deck orders', () => {
    const dates = ['2026-08-15', '2026-08-16', '2027-01-01', '2030-12-31'];
    const setups = dates.map((d) => buildDailySetup(d, amateurMoments, lifeEvents));

    const distinctStatDeltas = new Set(setups.map((s) => JSON.stringify(s.origin.statDeltas)));
    const distinctDeckOrders = new Set(setups.map((s) => s.eventDeckOrder.join(',')));
    expect(distinctStatDeltas.size).toBeGreaterThan(1);
    expect(distinctDeckOrders.size).toBeGreaterThan(1);
  });

  it('respects a custom deckSize, wrapping the seen-list once the pool is exhausted', () => {
    const bigDeck = buildDailySetup('2026-08-15', amateurMoments, lifeEvents, lifeEvents.length + 5);
    expect(bigDeck.eventDeckOrder).toHaveLength(lifeEvents.length + 5);
  });
});
