import { describe, expect, it } from 'vitest';
import { AmateurContentSchema, AttributesSchema, BalanceSchema } from '../src/state/schema';
import { loadContent } from '../src/content/load';
import { archetypes, attributeMeta, balance, amateurMoments } from '../src/content';

const validAttributes = {
  power: 50,
  technique: 50,
  speed: 50,
  wrestling: 50,
  groundControl: 50,
  chin: 50,
  cardio: 50,
  fightIQ: 50,
};

describe('AttributesSchema', () => {
  it('rejects an out-of-range attribute', () => {
    const bad = { ...validAttributes, power: 150 };
    expect(AttributesSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a fixture missing a required field', () => {
    const missingFightIQ: Partial<typeof validAttributes> = { ...validAttributes };
    delete missingFightIQ.fightIQ;
    expect(AttributesSchema.safeParse(missingFightIQ).success).toBe(false);
  });

  it('accepts a well-formed attributes object', () => {
    expect(AttributesSchema.safeParse(validAttributes).success).toBe(true);
  });
});

describe('loadContent', () => {
  it('throws a clear, non-silent error on invalid content', () => {
    expect(() => loadContent('fixture.json', { not: 'valid' }, BalanceSchema)).toThrow(
      /Invalid content in fixture\.json/,
    );
  });

  it('returns frozen data for valid content', () => {
    const result = loadContent('fixture.json', validAttributes, AttributesSchema);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.power).toBe(50);
  });
});

describe('real content fixtures', () => {
  it('balance.json validates and loads', () => {
    // k stays at its Appendix A starting value; kFinish (and the other
    // finish-related constants) were retuned in Loop 1.8 via the balance
    // lab to hit the win-rate and finish-rate acceptance gates — see
    // lab/report.ts for the documented target bands.
    expect(balance.k).toBe(13);
    expect(balance.kFinish).toBeTypeOf('number');
    expect(Object.isFrozen(balance)).toBe(true);
  });

  it('attributes.json covers exactly the 8 core attribute ids', () => {
    const ids = attributeMeta.map((a) => a.id).sort();
    expect(ids).toEqual(
      ['cardio', 'chin', 'fightIQ', 'groundControl', 'power', 'speed', 'technique', 'wrestling'].sort(),
    );
  });

  it('archetypes.json has at least 2 fixtures with valid attributes', () => {
    expect(archetypes.length).toBeGreaterThanOrEqual(2);
    for (const archetype of archetypes) {
      expect(AttributesSchema.safeParse(archetype.attributes).success).toBe(true);
    }
  });

  it('events/amateur.json has exactly 6 moments, each with 2-3 options', () => {
    expect(amateurMoments).toHaveLength(6);
    for (const moment of amateurMoments) {
      expect(moment.options.length).toBeGreaterThanOrEqual(2);
      expect(moment.options.length).toBeLessThanOrEqual(3);
    }
  });

  it('every moment in events/amateur.json is frozen (loaded, not clonable)', () => {
    expect(Object.isFrozen(amateurMoments)).toBe(true);
  });
});

describe('AmateurContentSchema — budget conservation is structural (DESIGN.md §9.1)', () => {
  function makeMoment(pointsA: number, pointsB: number) {
    return {
      id: 'm',
      prompt: 'test prompt',
      points: 12,
      options: [
        { id: 'a', label: 'A', text: 'a', statDeltas: { power: pointsA } },
        { id: 'b', label: 'B', text: 'b', statDeltas: { technique: pointsB } },
      ],
    };
  }

  it('rejects a moment where options do not sum to equal totals', () => {
    const moments = [makeMoment(12, 12), makeMoment(12, 12), makeMoment(12, 12), makeMoment(12, 12), makeMoment(12, 12), makeMoment(10, 12)];
    expect(AmateurContentSchema.safeParse(moments).success).toBe(false);
  });

  it('accepts a moment where every option sums to the declared point total', () => {
    const moments = Array.from({ length: 6 }, () => makeMoment(12, 12));
    expect(AmateurContentSchema.safeParse(moments).success).toBe(true);
  });

  it('rejects anything other than exactly 6 moments', () => {
    const fiveMoments = Array.from({ length: 5 }, () => makeMoment(12, 12));
    expect(AmateurContentSchema.safeParse(fiveMoments).success).toBe(false);
  });

  it('the real amateur.json content passes budget conservation', () => {
    expect(AmateurContentSchema.safeParse(amateurMoments).success).toBe(true);
  });
});
