import { describe, expect, it } from 'vitest';
import { drawLifeEvent, resolveLifeEventChoice } from '../src/career/events';
import { mulberry32 } from '../src/engine/rng';
import type { Fighter } from '../src/engine/types';
import type { LifeEvent } from '../src/state/schema';
import { initialCareerState } from '../src/state/store';
import { lifeEvents } from '../src/content';

function makeEvent(id: string, overrides: Partial<LifeEvent> = {}): LifeEvent {
  return {
    id,
    template: 'test-template',
    prompt: `prompt for ${id}`,
    options: [
      { id: 'a', label: 'A', text: 'a', effects: { hype: 5 } },
      { id: 'b', label: 'B', text: 'b', effects: { hype: -5 } },
    ],
    ...overrides,
  };
}

const pool: LifeEvent[] = Array.from({ length: 5 }, (_, i) => makeEvent(`e${i}`));

describe('drawLifeEvent', () => {
  it('is deterministic for a given seed', () => {
    const first = drawLifeEvent(pool, [], mulberry32(7));
    const second = drawLifeEvent(pool, [], mulberry32(7));
    expect(first).toEqual(second);
  });

  it('never draws an event already in seenEventIds while unseen ones remain', () => {
    const seen = ['e0', 'e1', 'e2', 'e3'];
    for (let seed = 1; seed <= 20; seed++) {
      const { event } = drawLifeEvent(pool, seen, mulberry32(seed));
      expect(event.id).toBe('e4');
    }
  });

  it('appends the drawn event to the returned seenEventIds', () => {
    const { event, seenEventIds } = drawLifeEvent(pool, ['e0'], mulberry32(3));
    expect(seenEventIds).toContain('e0');
    expect(seenEventIds).toContain(event.id);
    expect(seenEventIds).toHaveLength(2);
  });

  it('resets and draws from the full pool once every event has been seen', () => {
    const allSeen = pool.map((e) => e.id);
    const { event, seenEventIds } = drawLifeEvent(pool, allSeen, mulberry32(11));
    expect(pool.some((e) => e.id === event.id)).toBe(true);
    // The reset drops the exhausted seen-list and starts a fresh one with
    // just this draw, rather than growing forever.
    expect(seenEventIds).toEqual([event.id]);
  });

  it('is not degenerate — draws vary across seeds', () => {
    const drawn = new Set(
      Array.from({ length: 20 }, (_, i) => drawLifeEvent(pool, [], mulberry32(i + 1)).event.id),
    );
    expect(drawn.size).toBeGreaterThan(1);
  });

  it('draws schema-valid events from the real content/events/life.json pool', () => {
    const { event } = drawLifeEvent(lifeEvents, [], mulberry32(1));
    expect(lifeEvents.some((e) => e.id === event.id)).toBe(true);
  });
});

describe('resolveLifeEventChoice', () => {
  const fighter: Fighter = {
    id: 'p1',
    name: 'Test Fighter',
    nationality: 'USA',
    face: '000000000',
    weightClass: 'lightweight',
    stance: 'orthodox',
    attributes: {
      power: 50,
      technique: 50,
      speed: 50,
      wrestling: 50,
      groundControl: 50,
      chin: 50,
      cardio: 50,
      fightIQ: 50,
    },
    archetype: 'allrounder',
    weakness: null,
    traits: [],
    condition: { health: 80, injuries: [] },
  };

  it('applies lifeBars, hype, purse, and health deltas from the chosen option', () => {
    const career = {
      ...initialCareerState,
      player: fighter,
      purse: 1000,
      hype: 50,
      lifeBars: { trainingPartners: 50, partner: 50, sponsors: 50 },
    };
    const option = {
      id: 'opt',
      label: 'opt',
      text: 'opt',
      effects: { lifeBars: { trainingPartners: 5, partner: -3, sponsors: 2 }, hype: 4, purse: -200, health: -6 },
    };

    const after = resolveLifeEventChoice(career, option);
    expect(after.lifeBars).toEqual({ trainingPartners: 55, partner: 47, sponsors: 52 });
    expect(after.hype).toBe(54);
    expect(after.purse).toBe(800);
    expect(after.player!.condition.health).toBe(74);
  });

  it('clamps life bars and hype to 0..100', () => {
    const career = {
      ...initialCareerState,
      player: fighter,
      hype: 98,
      lifeBars: { trainingPartners: 3, partner: 97, sponsors: 50 },
    };
    const option = {
      id: 'opt',
      label: 'opt',
      text: 'opt',
      effects: { lifeBars: { trainingPartners: -10, partner: 10 }, hype: 10 },
    };

    const after = resolveLifeEventChoice(career, option);
    expect(after.lifeBars.trainingPartners).toBe(0);
    expect(after.lifeBars.partner).toBe(100);
    expect(after.hype).toBe(100);
  });

  it('floors purse at 0 rather than going negative', () => {
    const career = { ...initialCareerState, player: fighter, purse: 100 };
    const option = { id: 'opt', label: 'opt', text: 'opt', effects: { purse: -500 } };
    expect(resolveLifeEventChoice(career, option).purse).toBe(0);
  });

  it('leaves fields untouched when an option has no effect for that channel', () => {
    const career = {
      ...initialCareerState,
      player: fighter,
      purse: 1000,
      hype: 50,
      lifeBars: { trainingPartners: 50, partner: 50, sponsors: 50 },
    };
    const option = { id: 'opt', label: 'opt', text: 'opt', effects: { hype: 5 } };

    const after = resolveLifeEventChoice(career, option);
    expect(after.purse).toBe(1000);
    expect(after.lifeBars).toEqual(career.lifeBars);
    expect(after.player!.condition.health).toBe(80);
  });

  it('is a no-op on player health when there is no active player', () => {
    const career = { ...initialCareerState, player: null };
    const option = { id: 'opt', label: 'opt', text: 'opt', effects: { health: -10 } };
    expect(resolveLifeEventChoice(career, option).player).toBeNull();
  });
});
