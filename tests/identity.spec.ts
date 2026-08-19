// Loop 7.5 — style descriptors and scouting fidelity (DESIGN.md §16.5, §6.6).
//
// `fightIQ` fed the `mind` pillar and `mind` was read by nothing but the radar
// chart, which made the stat inert. §6.6 says IQ is "the fidelity of information
// surfaced to the player, not a hidden +X on rolls" — so these tests check two
// things the rest of the suite cannot: that every descriptor is a real predicate
// over real attributes, and that the three fidelity tiers differ in how many
// tendencies they show AND in how honest they are.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/engine/rng';
import { computePillars } from '../src/engine';
import type { Attributes, Fighter } from '../src/engine/types';
import {
  DESCRIPTORS,
  FIDELITY_TIERS,
  descriptorsFor,
  failedDescriptorsFor,
  fidelityFor,
  tendenciesFor,
  type DescriptorId,
} from '../src/career/identity';

const BASE: Attributes = {
  power: 50, technique: 50, speed: 50, wrestling: 50,
  groundControl: 50, chin: 50, cardio: 50, fightIQ: 50,
};

function fighter(attributes: Attributes): Fighter {
  return {
    id: 'opp',
    name: 'Test Opponent',
    nationality: 'usa',
    face: '000000000',
    weightClass: 'lightweight',
    stance: 'orthodox',
    attributes,
    archetype: 'allrounder',
    weakness: null,
    record: { wins: 5, losses: 2, draws: 0, noContests: 0 },
    traits: [],
    condition: { health: 100, injuries: [] },
  };
}

// One attribute set per descriptor, hand-built to satisfy that descriptor's
// predicate. These are the §16.5 table read back in the other direction: if a
// predicate is ever edited, the set that used to satisfy it stops doing so and
// the reachability test below fails.
const SATISFIES: Record<DescriptorId, Attributes> = {
  // striking pillar (power+technique+speed)/3 >= 60, and power >= technique.
  'pressure-striker': { ...BASE, power: 80, technique: 55, speed: 60 },
  technician: { ...BASE, technique: 75, power: 40 },
  'chain-wrestler': { ...BASE, wrestling: 72 },
  'top-control-grinder': { ...BASE, groundControl: 78, wrestling: 60 },
  'front-runner': { ...BASE, cardio: 45, speed: 65 },
  'late-rounds-grinder': { ...BASE, cardio: 74 },
  granite: { ...BASE, chin: 80 },
  'suspect-chin': { ...BASE, chin: 40 },
  'reads-the-fight': { ...BASE, fightIQ: 78 },
};

describe('the descriptor table is §16.5 exactly', () => {
  it('every descriptor is reachable — a real attribute set returns it', () => {
    for (const descriptor of DESCRIPTORS) {
      const attributes = SATISFIES[descriptor.id];
      expect(attributes, `no fixture for '${descriptor.id}'`).toBeDefined();
      expect(
        descriptorsFor(attributes).map((d) => d.id),
        `'${descriptor.id}' is unreachable — no Attributes set satisfies its predicate`,
      ).toContain(descriptor.id);
    }
  });

  it('carries the nine descriptors §16.5 tabulates, and no others', () => {
    expect(DESCRIPTORS.map((d) => d.id).sort()).toEqual(
      [
        'chain-wrestler', 'front-runner', 'granite', 'late-rounds-grinder',
        'pressure-striker', 'reads-the-fight', 'suspect-chin', 'technician',
        'top-control-grinder',
      ],
    );
  });

  it('no descriptor exists that is not a predicate over Attributes', () => {
    // §16.5's audit. A descriptor without a `test` would be an adjective, and
    // an adjective is what makes a scout card decorative.
    for (const descriptor of DESCRIPTORS) {
      expect(typeof descriptor.test, `'${descriptor.id}' has no predicate`).toBe('function');
      expect(descriptor.label.length).toBeGreaterThan(0);
    }
  });

  it('every predicate reads only fields that exist on Attributes', () => {
    // The teeth behind §16.5's cut list. A predicate that reached for heart or
    // killer instinct would have to name a field, and there is no field to
    // name — so a frozen attribute object records exactly what was touched.
    const attributeKeys = new Set(Object.keys(BASE));
    for (const descriptor of DESCRIPTORS) {
      const touched: string[] = [];
      const probe = new Proxy({ ...BASE }, {
        get(target, key: string) {
          touched.push(key);
          return target[key as keyof Attributes];
        },
      });
      descriptor.test(probe as Attributes);
      for (const key of touched) {
        expect(attributeKeys.has(key), `'${descriptor.id}' read a non-attribute '${key}'`).toBe(true);
      }
      expect(touched.length, `'${descriptor.id}' reads no attribute at all`).toBeGreaterThan(0);
    }
  });

  it('does not name anything §16.5 cut for having no backing field', () => {
    const cut = ['heart', 'killer', 'instinct', 'discipline', 'gritty', 'warrior', 'durab'];
    const source = readFileSync('src/career/identity.ts', 'utf8');
    for (const descriptor of DESCRIPTORS) {
      for (const word of cut) {
        expect(descriptor.label.toLowerCase()).not.toContain(word);
      }
    }
    // And the ids too, so a label rename cannot smuggle one back in.
    for (const id of DESCRIPTORS.map((d) => d.id)) {
      for (const word of cut) expect(id).not.toContain(word);
    }
    expect(source).toContain('predicate');
  });

  it('splits the vocabulary cleanly: satisfied + failed is always the whole table', () => {
    for (const attributes of Object.values(SATISFIES)) {
      const satisfied = descriptorsFor(attributes);
      const failed = failedDescriptorsFor(attributes);
      expect(satisfied.length + failed.length).toBe(DESCRIPTORS.length);
      const overlap = satisfied.filter((s) => failed.some((f) => f.id === s.id));
      expect(overlap).toEqual([]);
    }
  });

  it('a bland fighter earns no descriptor rather than a filler one', () => {
    expect(descriptorsFor(BASE)).toEqual([]);
  });
});

// A specialist who satisfies enough predicates to fill the top tier: a
// high-IQ, granite-chinned chain wrestler who also grinds top control.
const richOpponent = fighter({
  power: 50, technique: 50, speed: 50, wrestling: 74,
  groundControl: 80, chin: 78, cardio: 72, fightIQ: 76,
});

describe('fightIQ decides how many tendencies, and how honest (§6.6)', () => {
  it('the tiers are §16.5\'s table', () => {
    expect(fidelityFor(80)).toEqual({ minFightIQ: 70, count: 3, falseTendencies: 0 });
    expect(fidelityFor(70)).toEqual({ minFightIQ: 70, count: 3, falseTendencies: 0 });
    expect(fidelityFor(69)).toEqual({ minFightIQ: 45, count: 2, falseTendencies: 0 });
    expect(fidelityFor(45)).toEqual({ minFightIQ: 45, count: 2, falseTendencies: 0 });
    expect(fidelityFor(44).falseTendencies).toBe(1);
    expect(fidelityFor(0).count).toBe(2);
    expect(FIDELITY_TIERS).toHaveLength(3);
  });

  it('at fightIQ 80: three tendencies, all of them true', () => {
    const tendencies = tendenciesFor(richOpponent, 80, mulberry32(1));
    expect(tendencies).toHaveLength(3);
    for (const tendency of tendencies) {
      expect(tendency.true).toBe(true);
      // Not merely flagged true — actually satisfied by the opponent.
      const descriptor = DESCRIPTORS.find((d) => d.id === tendency.id)!;
      expect(descriptor.test(richOpponent.attributes)).toBe(true);
    }
  });

  it('at fightIQ 55: two tendencies, all of them true', () => {
    const tendencies = tendenciesFor(richOpponent, 55, mulberry32(1));
    expect(tendencies).toHaveLength(2);
    for (const tendency of tendencies) {
      const descriptor = DESCRIPTORS.find((d) => d.id === tendency.id)!;
      expect(descriptor.test(richOpponent.attributes)).toBe(true);
    }
  });

  it('at fightIQ 30: two tendencies, exactly one of which the opponent does NOT satisfy', () => {
    const tendencies = tendenciesFor(richOpponent, 30, mulberry32(1));
    expect(tendencies).toHaveLength(2);

    const actuallyTrue = tendencies.filter((t) =>
      DESCRIPTORS.find((d) => d.id === t.id)!.test(richOpponent.attributes),
    );
    expect(actuallyTrue).toHaveLength(1);
    // And the `true` flag agrees with the predicate, so the flag can be trusted
    // by the aftermath screen that will one day show the player what they missed.
    for (const tendency of tendencies) {
      expect(tendency.true).toBe(
        DESCRIPTORS.find((d) => d.id === tendency.id)!.test(richOpponent.attributes),
      );
    }
  });

  it('the false tendency is not pinned to a position', () => {
    // §16.5: "shown with identical confidence". If the lie were always last, a
    // player would read perfect information off an imperfect stat.
    const positions = new Set<number>();
    for (let seed = 0; seed < 60; seed++) {
      const tendencies = tendenciesFor(richOpponent, 30, mulberry32(seed));
      positions.add(tendencies.findIndex((t) => !t.true));
    }
    expect([...positions].sort()).toEqual([0, 1]);
  });

  it('a low-IQ read is wrong about different things on different opponents', () => {
    const lies = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const tendencies = tendenciesFor(richOpponent, 30, mulberry32(seed));
      lies.add(tendencies.find((t) => !t.true)!.id);
    }
    expect(lies.size).toBeGreaterThan(1);
  });

  it('never marks a false tendency in the rendered fields', () => {
    // The only signal a card could render is `label`. It must be identical in
    // form whether the tendency is true or false.
    for (let seed = 0; seed < 40; seed++) {
      for (const tendency of tendenciesFor(richOpponent, 30, mulberry32(seed))) {
        const descriptor = DESCRIPTORS.find((d) => d.id === tendency.id)!;
        expect(tendency.label).toBe(descriptor.label);
      }
    }
  });

  it('reads the PLAYER\'s fightIQ, never the opponent\'s', () => {
    // Scouting is a thing the player does. A sharp opponent does not make the
    // player's read of them better.
    const dimOpponent = fighter({ ...richOpponent.attributes, fightIQ: 10 });
    const sharpOpponent = fighter({ ...richOpponent.attributes, fightIQ: 95 });
    expect(tendenciesFor(dimOpponent, 80, mulberry32(7))).toHaveLength(3);
    expect(tendenciesFor(sharpOpponent, 30, mulberry32(7))).toHaveLength(2);
  });
});

describe('tendencies are deterministic and total', () => {
  it('the same seed, opponent, and fightIQ give the same list', () => {
    for (const iq of [80, 55, 30]) {
      expect(tendenciesFor(richOpponent, iq, mulberry32(99))).toEqual(
        tendenciesFor(richOpponent, iq, mulberry32(99)),
      );
    }
  });

  it('different seeds surface different tendencies from the same opponent', () => {
    const lists = new Set(
      Array.from({ length: 40 }, (_, seed) =>
        tendenciesFor(richOpponent, 80, mulberry32(seed))
          .map((t) => t.id)
          .join(','),
      ),
    );
    expect(lists.size).toBeGreaterThan(1);
  });

  it('a bland opponent yields fewer tendencies rather than an invented one', () => {
    // Rule 1 forbids inventing a descriptor to pad the list, so the top tier
    // simply returns what is true. The empty state is the ScoutCard's problem.
    const bland = fighter(BASE);
    expect(tendenciesFor(bland, 80, mulberry32(1))).toEqual([]);

    const lowIQRead = tendenciesFor(bland, 30, mulberry32(1));
    expect(lowIQRead).toHaveLength(1);
    expect(lowIQRead[0].true).toBe(false);
  });

  it('never returns more than the tier allows, across many random opponents', () => {
    for (let seed = 0; seed < 200; seed++) {
      const rng = mulberry32(seed);
      const attributes = Object.fromEntries(
        Object.keys(BASE).map((key) => [key, Math.round(rng.next() * 100)]),
      ) as unknown as Attributes;
      const opponent = fighter(attributes);
      for (const iq of [80, 55, 30]) {
        const tendencies = tendenciesFor(opponent, iq, mulberry32(seed + 1000));
        expect(tendencies.length).toBeLessThanOrEqual(fidelityFor(iq).count);
        // No duplicates: a card showing "Granite" twice is a bug, not a read.
        expect(new Set(tendencies.map((t) => t.id)).size).toBe(tendencies.length);
      }
    }
  });

  it('the striking predicate uses the pillar, not a raw attribute', () => {
    // §16.5 writes `striking >= 60`, and §4.1 defines striking as a pillar.
    // A fighter with no single striking attribute at 60 can still clear it.
    const attributes: Attributes = { ...BASE, power: 62, technique: 59, speed: 59 };
    expect(computePillars(attributes).striking).toBeGreaterThanOrEqual(60);
    expect(descriptorsFor(attributes).map((d) => d.id)).toContain('pressure-striker');
  });
});
