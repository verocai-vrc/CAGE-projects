// Loop 7.10 — the reachability manifest, checked in both directions
// (DESIGN.md §16.1, §16.6).
//
// §16.6: "The manifest is checked in both directions by a companion test that
// runs seeded bouts with corner tactics supplied and asserts the observed
// variant set EQUALS the manifest. Make `position: 'clinch'` reachable and the
// test fails until lines exist for it; break `knockdown` and the test fails
// too. A naive enum walk can only catch one of those."
//
// That equality is the whole point. A subset assertion in either direction is
// half a test: `observed ⊆ manifest` misses a variant that stopped firing (the
// exact failure §16.1 recorded for `knockdown` and `finish:TKO` before Loop
// 7.2's damage re-tune), and `manifest ⊆ observed` misses a newly reachable
// variant that no pool has lines for.

import { describe, expect, it } from 'vitest';
import { simulateFight } from '../src/engine/fight';
import { mulberry32 } from '../src/engine/rng';
import type { Fighter, FightEvent, MomentOverrides, TacticId, Tactics } from '../src/engine/types';
import { archetypes } from '../src/content';
import {
  REACHABLE_EVENT_VARIANTS,
  UNREACHABLE_BY_CONSTRUCTION,
  eventVariant,
} from '../src/narration/manifest';

/**
 * §16.6 specifies 500 bouts. This runs 3,000, and the reason is measured rather
 * than cautious: `playerMoment:submissionEscape:success:played` first appears at
 * bout 519 of this sequence and fires 10 times in 3,000. A submissionEscape
 * moment occurs in roughly 1.2% of bouts, and the variant needs that moment to
 * coincide with a supplied override — at 500 bouts the sample simply does not
 * contain one, and the manifest would have to omit a variant that IS reachable
 * to make the test pass. The sample size serves the manifest's honesty; §16.6's
 * 500 predates the per-minute-check amendment and this measurement.
 *
 * The run is fully deterministic — fixed seeds, fixed pairings — so this is a
 * fixed set, not a flaky one. It costs about a second.
 */
const BOUTS = 3000;

const TACTIC_IDS: TacticId[] = ['pressPace', 'shootTakedowns', 'protectLead', 'headhunt', 'balanced'];

function fighterFromArchetype(id: string, archetypeId: string): Fighter {
  const archetype = archetypes.find((entry) => entry.id === archetypeId);
  if (!archetype) throw new Error(`missing archetype fixture: ${archetypeId}`);
  return {
    id,
    name: id,
    nickname: null,
    nationality: 'testland',
    face: '000000000000',
    weightClass: 'lightweight',
    stance: 'orthodox',
    attributes: { ...archetype.attributes },
    archetype: archetype.id,
    weakness: null,
    record: { wins: 0, losses: 0, draws: 0, noContests: 0 },
    traits: [],
    condition: { health: 100, injuries: [] },
  };
}

/**
 * Every moment in the bout played, alternating a hard-won and a hard-lost
 * performance. Dense rather than a few indices: a submissionEscape moment can
 * land at any index, and an override map that stops at 5 leaves the rare
 * variants permanently 'auto'.
 */
function denseOverrides(parity: number): MomentOverrides {
  const overrides: MomentOverrides = {};
  for (let index = 0; index < 40; index++) {
    overrides[index] = (index + parity) % 2 === 0 ? 0.95 : -0.95;
  }
  return overrides;
}

/** The observed variant set, and the events behind it. */
function observeVariants(): { observed: Set<string>; events: number } {
  const archetypeIds = archetypes.map((entry) => entry.id);
  const observed = new Set<string>();
  let events = 0;

  for (let n = 0; n < BOUTS; n++) {
    const a = fighterFromArchetype('a', archetypeIds[n % archetypeIds.length]);
    const b = fighterFromArchetype('b', archetypeIds[(n * 7 + 3) % archetypeIds.length]);

    // Corner tactics supplied, as §16.6 requires — `cornerCall` is emitted only
    // in rounds > 1 and only when a plan entry exists, so a no-tactics sample
    // would report it unreachable.
    const rounds: Record<number, TacticId> = {};
    for (let round = 1; round <= 5; round++) rounds[round] = TACTIC_IDS[(n + round) % TACTIC_IDS.length];
    const tactics: Tactics = {
      a: { cutQuality: 'clean', rounds },
      b: { cutQuality: 'clean', rounds },
    };

    // Half the sample resolves moments automatically and half is played, so
    // both the ':auto' and ':played' halves of the moment variants are covered.
    const overrides: MomentOverrides = n % 2 === 0 ? {} : denseOverrides(n);

    const result = simulateFight(a, b, tactics, mulberry32(n), overrides);
    for (const event of result.events) {
      observed.add(eventVariant(event));
      events++;
    }
  }

  return { observed, events };
}

// Measured once — 3,000 bouts is cheap but not free, and every assertion below
// reads the same sample.
const { observed, events } = observeVariants();

describe('the reachability manifest (§16.1, §16.6)', () => {
  it('observes a real sample', () => {
    // Guards against the sample silently collapsing to nothing and every
    // set-equality assertion below passing vacuously.
    expect(events).toBeGreaterThan(100_000);
  });

  it('the observed variant set EQUALS the manifest', () => {
    // The headline assertion. Sorted arrays rather than sets so a failure prints
    // the actual difference rather than "Set(29) !== Set(28)".
    expect([...observed].sort()).toEqual([...REACHABLE_EVENT_VARIANTS].sort());
  });

  it('fails if a variant disappears — every manifest entry is observed', () => {
    // The direction §16.1 caught by measurement: knockdown and finish:TKO fired
    // 0 times in 400 bouts before Loop 7.2's damage re-tune. Had this test
    // existed then, it would have failed instead of the defect reaching §16.1's
    // planning pass.
    const missing = REACHABLE_EVENT_VARIANTS.filter((variant) => !observed.has(variant));
    expect(missing, `manifest lists variants the engine no longer emits: ${missing.join(', ')}`).toEqual([]);
  });

  it('fails if a variant appears — every observed variant is in the manifest', () => {
    // The other direction: make position:'clinch' reachable and this fails
    // until the manifest (and, from 7.13, the line pools) account for it.
    const unexpected = [...observed].filter((variant) => !REACHABLE_EVENT_VARIANTS.includes(variant));
    expect(unexpected, `engine emits variants absent from the manifest: ${unexpected.join(', ')}`).toEqual([]);
  });

  it('never observes a variant that is unreachable by construction', () => {
    // §16.1: `landed: false`, `position: 'clinch'` and `position: 'bottomControl'`
    // are unreachable because no code path emits them — not because they are
    // rare. Kept explicit so making one reachable fails loudly rather than
    // quietly widening the manifest.
    for (const variant of UNREACHABLE_BY_CONSTRUCTION) {
      expect(observed.has(variant), `'${variant}' is no longer unreachable — §16.1 needs updating`).toBe(false);
    }
    // And it is genuinely disjoint from the manifest, not merely unobserved.
    for (const variant of UNREACHABLE_BY_CONSTRUCTION) {
      expect(REACHABLE_EVENT_VARIANTS).not.toContain(variant);
    }
  });

  it('classifies every observed event — no UNCLASSIFIED bucket', () => {
    // A new FightEvent type must be classified deliberately. Without this, a
    // new event would land in one bucket, the manifest would gain one entry,
    // and no pool would ever be written for it.
    const unclassified = [...observed].filter((variant) => variant.startsWith('UNCLASSIFIED:'));
    expect(unclassified).toEqual([]);
  });

  it('the manifest has no duplicates', () => {
    expect(new Set(REACHABLE_EVENT_VARIANTS).size).toBe(REACHABLE_EVENT_VARIANTS.length);
  });
});

describe('eventVariant', () => {
  it('is stable and total over the event union', () => {
    const cases: [FightEvent, string][] = [
      [{ t: 'strike', by: 'a', kind: 'strike', landed: true, damage: 1, round: 1 }, 'strike:strike:landed=true'],
      [{ t: 'strike', by: 'a', kind: 'strike', landed: false, damage: 0, round: 1 }, 'strike:strike:landed=false'],
      [{ t: 'takedown', by: 'a', success: true, round: 1 }, 'takedown:success=true'],
      [{ t: 'position', state: 'clinch', round: 1 }, 'position:clinch'],
      [{ t: 'knockdown', who: 'b', round: 1 }, 'knockdown'],
      [{ t: 'submissionAttempt', by: 'a', escaped: false, round: 1 }, 'submissionAttempt:escaped=false'],
      [{ t: 'cornerCall', round: 2, tacticId: 'pressPace' }, 'cornerCall'],
      [
        { t: 'playerMoment', round: 1, index: 0, kind: 'scramble', outcome: 'success', played: true },
        'playerMoment:scramble:success:played',
      ],
      [
        { t: 'playerMoment', round: 1, index: 0, kind: 'scramble', outcome: 'success', played: false },
        'playerMoment:scramble:success:auto',
      ],
      [{ t: 'roundEnd', round: 1, scoreA: 10, scoreB: 9, staminaA: 80, staminaB: 70 }, 'roundEnd'],
      [
        { t: 'checkEnd', round: 1, check: 1, strikesA: 3, strikesB: 1, controlA: 0, controlB: 0, winner: 'a' },
        'checkEnd:winner=a',
      ],
      [{ t: 'finish', who: 'a', method: 'KO', round: 1 }, 'finish:KO'],
    ];

    for (const [event, expected] of cases) {
      expect(eventVariant(event)).toBe(expected);
    }
  });

  it('flags an unknown event type rather than absorbing it', () => {
    expect(eventVariant({ t: 'somethingNew' })).toBe('UNCLASSIFIED:somethingNew');
  });
});
