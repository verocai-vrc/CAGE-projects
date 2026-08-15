import { describe, expect, it } from 'vitest';
import { AmateurContentSchema, AttributesSchema, BalanceSchema, LifeEventContentSchema } from '../src/state/schema';
import { loadContent } from '../src/content/load';
import { archetypes, attributeMeta, balance, amateurMoments, lifeEvents } from '../src/content';

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

describe('events/life.json — content-loader validation (DESIGN.md §12: ~60 events)', () => {
  it('has at least 60 events, each schema-valid with 2-3 options', () => {
    expect(lifeEvents.length).toBeGreaterThanOrEqual(60);
    for (const event of lifeEvents) {
      expect(event.options.length).toBeGreaterThanOrEqual(2);
      expect(event.options.length).toBeLessThanOrEqual(3);
    }
  });

  it('is frozen (loaded, not clonable)', () => {
    expect(Object.isFrozen(lifeEvents)).toBe(true);
  });

  it('rejects a pool under 60 events', () => {
    const tooFew = Array.from({ length: 59 }, (_, i) => ({
      id: `e${i}`,
      template: 't',
      prompt: 'p',
      options: [
        { id: 'a', label: 'a', text: 'a', effects: {} },
        { id: 'b', label: 'b', text: 'b', effects: {} },
      ],
    }));
    expect(LifeEventContentSchema.safeParse(tooFew).success).toBe(false);
  });

  it('rejects duplicate event ids', () => {
    const dupe = Array.from({ length: 60 }, (_, i) => ({
      id: i === 0 ? 'dup' : `e${i}`,
      template: 't',
      prompt: 'p',
      options: [
        { id: 'a', label: 'a', text: 'a', effects: {} },
        { id: 'b', label: 'b', text: 'b', effects: {} },
      ],
    }));
    dupe[1].id = 'dup';
    expect(LifeEventContentSchema.safeParse(dupe).success).toBe(false);
  });

  // The "lint/report" step DEVELOPMENT_LOOPS.md's Loop 4.5 asks for: prove the
  // pool is built from a small number of reused templates (DESIGN.md §1
  // pillar 3), not 60 one-off entries wearing a `template` label for show.
  // Printing the table doubles as the report; the assertions are the guard.
  it('is templated — a small number of templates, each reused several times', () => {
    const counts = new Map<string, number>();
    for (const event of lifeEvents) {
      counts.set(event.template, (counts.get(event.template) ?? 0) + 1);
    }

    console.log('\nlife.json template usage report:');
    for (const [template, count] of [...counts.entries()].sort()) {
      console.log(`  ${template}: ${count}`);
    }

    const distinctTemplates = counts.size;
    // Fewer distinct templates than events (real reuse) but not so few that
    // the pool reads as one template copy-pasted with new flavor text.
    expect(distinctTemplates).toBeGreaterThanOrEqual(8);
    expect(distinctTemplates).toBeLessThanOrEqual(20);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });
});
