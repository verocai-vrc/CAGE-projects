import { describe, expect, it } from 'vitest';
import { buildOriginFromChoices, fighterFromOrigin } from '../src/career/origin';
import { OriginSchema, FighterSchema, type MomentOption } from '../src/state/schema';
import { amateurMoments } from '../src/content';

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
