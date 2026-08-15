import { describe, expect, it } from 'vitest';
import { buildOriginFromChoices, fighterFromOrigin, rollRandomOrigin } from '../src/career/origin';
import { OriginSchema, FighterSchema, type MomentOption } from '../src/state/schema';
import { amateurMoments } from '../src/content';
import { mulberry32 } from '../src/engine/rng';

function option(id: string, statDeltas: Record<string, number>, extra: Partial<MomentOption> = {}): MomentOption {
  return { id, label: id, text: id, statDeltas, ...extra };
}

describe('buildOriginFromChoices', () => {
  it('sums statDeltas across all chosen options', () => {
    const chosen = [option('a', { power: 5 }), option('b', { power: 3, technique: 4 })];
    const origin = buildOriginFromChoices(chosen);
    expect(origin.statDeltas.power).toBe(8);
    expect(origin.statDeltas.technique).toBe(4);
  });

  it('produces a schema-valid Origin', () => {
    const chosen = [option('a', { power: 12 })];
    const origin = buildOriginFromChoices(chosen);
    expect(OriginSchema.safeParse(origin).success).toBe(true);
  });

  it('classifies a striking-heavy build as striker, grappling-heavy as wrestler, balanced as allrounder', () => {
    const striker = buildOriginFromChoices([option('a', { power: 20, technique: 20 })]);
    expect(striker.archetype).toBe('striker');

    const wrestler = buildOriginFromChoices([option('a', { wrestling: 20, groundControl: 20 })]);
    expect(wrestler.archetype).toBe('wrestler');

    const allrounder = buildOriginFromChoices([option('a', { power: 6, wrestling: 6 })]);
    expect(allrounder.archetype).toBe('allrounder');
  });

  it('carries the weakness from whichever chosen option sets one, or null if none did', () => {
    const withWeakness = buildOriginFromChoices([
      option('a', { power: 4 }),
      option('b', { technique: 4 }, { weakness: 'submission-defense' }),
    ]);
    expect(withWeakness.weakness).toBe('submission-defense');

    const withoutWeakness = buildOriginFromChoices([option('a', { power: 4 })]);
    expect(withoutWeakness.weakness).toBeNull();
  });

  it('carries the mentor gym from whichever chosen option sets one, or a default if none did', () => {
    const withGym = buildOriginFromChoices([option('a', { power: 4 }, { mentorGymId: 'ironside-mma' })]);
    expect(withGym.mentorGymId).toBe('ironside-mma');

    const withoutGym = buildOriginFromChoices([option('a', { power: 4 })]);
    expect(withoutGym.mentorGymId).toBeTruthy();
  });

  it('amateurRecord is narrated (a fixed lookup), not simulated — no randomness across repeated calls', () => {
    const chosen = [option('a', { power: 20, technique: 20 })];
    const first = buildOriginFromChoices(chosen);
    const second = buildOriginFromChoices(chosen);
    expect(first.amateurRecord).toEqual(second.amateurRecord);
    expect(first.hypeModifier).toBe(second.hypeModifier);
  });

  it('one option chosen from every real amateur.json moment produces a schema-valid Origin and Fighter', () => {
    const chosen = amateurMoments.map((moment) => moment.options[0]);
    const origin = buildOriginFromChoices(chosen);
    expect(OriginSchema.safeParse(origin).success).toBe(true);

    const fighter = fighterFromOrigin(origin, 'p1', 'Test Fighter', 'USA', 'lightweight');
    expect(FighterSchema.safeParse(fighter).success).toBe(true);
  });

  it('the real amateur.json content has at least one option carrying a mentor gym and one carrying a weakness', () => {
    const gymOptions = amateurMoments.flatMap((m) => m.options).filter((o) => o.mentorGymId);
    const weaknessOptions = amateurMoments.flatMap((m) => m.options).filter((o) => o.weakness);
    expect(gymOptions.length).toBeGreaterThan(0);
    expect(weaknessOptions.length).toBeGreaterThan(0);
  });
});

// DESIGN.md §9.3: the skip path rolls a seeded Origin and hands it to the
// same pro-debut entry point the montage uses — these tests exist to prove
// that handoff, not to re-test buildOriginFromChoices's folding logic.
describe('rollRandomOrigin', () => {
  it('produces a schema-valid Origin and Fighter from the real amateur.json content, across many seeds', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const origin = rollRandomOrigin(amateurMoments, mulberry32(seed));
      expect(OriginSchema.safeParse(origin).success).toBe(true);

      const fighter = fighterFromOrigin(origin, 'p1', 'Random Prospect', 'USA', 'lightweight');
      expect(FighterSchema.safeParse(fighter).success).toBe(true);
    }
  });

  it('is deterministic for a given seed', () => {
    const first = rollRandomOrigin(amateurMoments, mulberry32(42));
    const second = rollRandomOrigin(amateurMoments, mulberry32(42));
    expect(first).toEqual(second);
  });

  it('is not degenerate — different seeds roll different origins', () => {
    const origins = Array.from({ length: 20 }, (_, i) => rollRandomOrigin(amateurMoments, mulberry32(i + 1)));
    const distinctArchetypes = new Set(origins.map((o) => o.archetype));
    const distinctStatDeltas = new Set(origins.map((o) => JSON.stringify(o.statDeltas)));
    expect(distinctArchetypes.size).toBeGreaterThan(1);
    expect(distinctStatDeltas.size).toBeGreaterThan(1);
  });
});
