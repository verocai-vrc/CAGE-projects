import { describe, expect, it } from 'vitest';
import { AttributesSchema, BalanceSchema } from '../src/state/schema';
import { loadContent } from '../src/content/load';
import { archetypes, attributeMeta, balance } from '../src/content';

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
});
