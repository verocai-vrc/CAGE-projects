// Loop 7.6 — nicknames (DESIGN.md §16.5, §13, §16.9).
//
// "The nickname is the mnemonic handle that survives the fight." It has to be
// distinctive enough that six bouts later the player still knows who "Overtime"
// was, rare enough to be worth having — §16.5 puts it at roughly 65%, because
// "universal nicknames devalue the nickname" — and, since §13 forbids modelling
// real athletes, nobody's.
//
// The trademark check is the reason this file also reaches into scripts/: the
// pools generate a product space of {adjective} x {noun} that no human author
// can hold in their head, so every combination the generator can reach is run
// through the same denylist the CI lint applies to authored strings.

import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/engine/rng';
import { nicknames, archetypes, namePools } from '../src/content';
import { NICKNAME_CHANCE, nicknameFor } from '../src/career/identity';
import { generateOpponent, type NamePool } from '../src/career/matchmaking';
import { startCareer } from '../src/career/progression';
import { NicknameContentSchema } from '../src/state/schema';
import { denyReason, checkContentDir, BANNED_MARKS, BANNED_MONIKERS } from '../scripts/check-content.mjs';

const SAMPLE = 1000;

const testPools: NamePool[] = [
  {
    nationality: 'USA',
    weight: 1,
    firstNames: ['Al', 'Bo', 'Cy', 'Dee', 'Eli', 'Flo', 'Gus', 'Hal'],
    lastNames: ['Fox', 'Grey', 'Hale', 'Ives', 'Jones', 'Kerr', 'Lowe', 'Marsh'],
  },
];
const templates = archetypes.map((a) => ({ id: a.id, weight: a.weight, attributes: a.attributes }));
const drawFace = (rng: { next: () => number }) => String(Math.floor(rng.next() * 1e9)).padStart(9, '0');

/** §16.5's verify is stated over generated fighters, not over the raw helper,
 *  so the rate is measured where it actually reaches a player. */
const generated = Array.from({ length: SAMPLE }, (_, i) =>
  generateOpponent(templates, testPools, mulberry32(i), { weightClass: 'lightweight', ranking: 8 }, drawFace),
);

describe('assignment rate and variety (§16.5)', () => {
  it('1,000 seeded fighters produce at least 200 distinct nicknames', () => {
    const distinct = new Set(generated.map((f) => f.nickname).filter((n): n is string => n !== null));
    expect(distinct.size).toBeGreaterThanOrEqual(200);
  });

  it('the null rate is within 5 points of the target', () => {
    const nullRate = generated.filter((f) => f.nickname === null).length / SAMPLE;
    expect(NICKNAME_CHANCE).toBe(0.65);
    expect(Math.abs(nullRate - (1 - NICKNAME_CHANCE))).toBeLessThan(0.05);
  });

  it('produces both shapes: two-part and standalone', () => {
    const assigned = generated.map((f) => f.nickname).filter((n): n is string => n !== null);
    const standaloneWords = new Set(nicknames.standalone.map((s) => s.word));
    const standalone = assigned.filter((n) => standaloneWords.has(n));
    expect(standalone.length).toBeGreaterThan(0);
    expect(assigned.length - standalone.length).toBeGreaterThan(0);
  });

  it('no nickname is blank or whitespace', () => {
    for (const fighter of generated) {
      if (fighter.nickname !== null) expect(fighter.nickname.trim()).toBe(fighter.nickname);
      if (fighter.nickname !== null) expect(fighter.nickname.length).toBeGreaterThan(0);
    }
  });

  it('leans toward archetype and nationality without becoming a filter', () => {
    // A lean is a weight multiplier, not a gate (see NicknameContentSchema):
    // the pools would read as five separate games otherwise. So a Japanese
    // fighter must be *able* to draw a word tagged for another nationality.
    const japanese = Array.from({ length: 400 }, (_, i) =>
      nicknameFor(mulberry32(i), 'striker', 'Japan'),
    ).filter((n): n is string => n !== null);

    const japanTagged = new Set(
      [...nicknames.adjectives, ...nicknames.nouns, ...nicknames.standalone]
        .filter((p) => p.nationalities?.includes('Japan'))
        .map((p) => p.word),
    );
    const irelandTagged = new Set(
      [...nicknames.adjectives, ...nicknames.nouns, ...nicknames.standalone]
        .filter((p) => p.nationalities?.includes('Ireland'))
        .map((p) => p.word),
    );
    const uses = (pool: Set<string>) =>
      japanese.filter((n) => n.split(' ').some((w) => pool.has(w)) || pool.has(n)).length;

    expect(uses(japanTagged)).toBeGreaterThan(0);
    expect(uses(irelandTagged)).toBeGreaterThan(0);
  });
});

describe('determinism and stream discipline', () => {
  it('the same seed produces the same nickname, twice', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(nicknameFor(mulberry32(seed), 'wrestler', 'Poland')).toBe(
        nicknameFor(mulberry32(seed), 'wrestler', 'Poland'),
      );
    }
  });

  it('a whole generated fighter replays identically', () => {
    const once = generateOpponent(templates, testPools, mulberry32(77), { weightClass: 'lw', ranking: 3 }, drawFace);
    const twice = generateOpponent(templates, testPools, mulberry32(77), { weightClass: 'lw', ranking: 3 }, drawFace);
    expect(once).toEqual(twice);
  });

  it('consumes a fixed number of draws whether or not a nickname is assigned', () => {
    // Otherwise the ~35% who get none would leave the stream in a different
    // place, and the next draw off it would depend on a coin flip.
    const drawsUsed = (seed: number) => {
      const rng = mulberry32(seed);
      let count = 0;
      const counted = { next: () => { count++; return rng.next(); } };
      nicknameFor(counted, 'striker', 'USA');
      return count;
    };
    const counts = new Set(Array.from({ length: 200 }, (_, i) => drawsUsed(i)));
    expect(counts.size).toBe(1);
  });

  it('the player gets one from their own career seed, at the same rate', () => {
    const origin = {
      statDeltas: {},
      archetype: 'allrounder',
      weakness: null,
      mentorGymId: 'neighborhood-gym',
      hypeModifier: 0,
      amateurRecord: { wins: 3, losses: 1 },
    };
    const players = Array.from({ length: 400 }, (_, i) =>
      startCareer(origin, `SEED${i}`, 'p1', 'Test Fighter').player!,
    );
    const nullRate = players.filter((p) => p.nickname === null).length / players.length;
    expect(Math.abs(nullRate - (1 - NICKNAME_CHANCE))).toBeLessThan(0.08);

    // And the same seed gives the same player twice — a daily run hands
    // everyone the same fighter with the same handle.
    expect(startCareer(origin, 'DAILY-2026-08-19', 'p1', 'X').player!.nickname).toBe(
      startCareer(origin, 'DAILY-2026-08-19', 'p1', 'X').player!.nickname,
    );
  });

  it('an explicit nickname overrides the roll, and null means none', () => {
    const origin = {
      statDeltas: {}, archetype: 'striker', weakness: null,
      mentorGymId: 'neighborhood-gym', hypeModifier: 0, amateurRecord: { wins: 0, losses: 0 },
    };
    expect(startCareer(origin, 'S', 'p1', 'X', { nickname: 'The Understudy' }).player!.nickname).toBe(
      'The Understudy',
    );
    expect(startCareer(origin, 'S', 'p1', 'X', { nickname: null }).player!.nickname).toBeNull();
  });
});

describe('content validity', () => {
  it('nicknames.json validates against its schema', () => {
    expect(NicknameContentSchema.safeParse(nicknames).success).toBe(true);
  });

  it('rejects a pool with a zero or negative weight', () => {
    const broken = { ...nicknames, adjectives: [{ word: 'Broken', weight: 0 }] };
    expect(NicknameContentSchema.safeParse(broken).success).toBe(false);
  });

  it('has enough combinations to sustain a 200-nickname sample', () => {
    const combinations = nicknames.adjectives.length * nicknames.nouns.length + nicknames.standalone.length;
    expect(combinations).toBeGreaterThan(500);
  });

  it('every nationality in the name pools is one the nickname pools recognise', () => {
    // A lean tagged for a nationality nothing generates is dead weight.
    const known = new Set(namePools.map((p) => p.nationality));
    const tagged = new Set(
      [...nicknames.adjectives, ...nicknames.nouns, ...nicknames.standalone]
        .flatMap((p) => p.nationalities ?? []),
    );
    for (const nationality of tagged) expect(known.has(nationality)).toBe(true);
  });

  it('every archetype lean names a real archetype', () => {
    const known = new Set(archetypes.map((a) => a.id));
    const tagged = new Set(
      [...nicknames.adjectives, ...nicknames.nouns, ...nicknames.standalone]
        .flatMap((p) => p.archetypes ?? []),
    );
    for (const archetype of tagged) expect(known.has(archetype)).toBe(true);
  });
});

describe('the trademark denylist (§13, §16.9)', () => {
  it('the shipped content is clean', () => {
    expect(checkContentDir()).toEqual([]);
  });

  it('every nickname the generator can possibly produce is clean', () => {
    // The combinations are the part authoring discipline cannot cover: nobody
    // reads 960 pairings before committing a pool.
    const offenders: string[] = [];
    for (const adjective of nicknames.adjectives) {
      for (const noun of nicknames.nouns) {
        const candidate = `${adjective.word} ${noun.word}`;
        const reason = denyReason(candidate);
        if (reason) offenders.push(`"${candidate}" ${reason}`);
      }
    }
    for (const solo of nicknames.standalone) {
      const reason = denyReason(solo.word);
      if (reason) offenders.push(`"${solo.word}" ${reason}`);
    }
    expect(offenders).toEqual([]);
    expect(nicknames.adjectives.length * nicknames.nouns.length).toBeGreaterThan(500);
  });

  it('fires on a real fighter\'s moniker', () => {
    // Loop 7.6's verify: prove the denylist actually catches something. Doing
    // it here rather than by temporarily poisoning a content file means the
    // proof stays in the repo instead of living in a commit message.
    expect(denyReason('The Notorious')).toMatch(/moniker/);
    expect(denyReason('notorious')).toMatch(/moniker/);
    expect(denyReason('Mighty Mouse')).toMatch(/moniker/);
    expect(denyReason('The Korean Zombie')).toMatch(/moniker/);
  });

  it('fires on an org or venue mark anywhere in a string', () => {
    expect(denyReason('UFC 300')).toMatch(/banned mark/);
    expect(denyReason('the octagon')).toMatch(/banned mark/);
    expect(denyReason('Zuffa Boxing')).toMatch(/banned mark/);
    // Substring, not whole-value — §13 bans the word, not just the exact name.
    expect(denyReason('a fight in the Octagon tonight')).toMatch(/banned mark/);
  });

  it('does not reject ordinary words that merely appear inside a moniker', () => {
    // Monikers are whole-value matches on purpose: every real nickname is made
    // of ordinary English, and substring matching would make the life-event
    // pools unwritable.
    expect(denyReason('He broke three bones in his hand')).toBeNull();
    expect(denyReason('Iron-Jawed Anvil')).toBeNull();
    expect(denyReason('a natural athlete')).toBeNull();
  });

  it('normalises case, punctuation, and a leading "the"', () => {
    expect(denyReason('THE  NOTORIOUS!')).toMatch(/moniker/);
    expect(denyReason('el-cucuy')).toMatch(/moniker/);
  });

  it('the lists are non-trivial', () => {
    expect(BANNED_MARKS.length).toBeGreaterThan(5);
    expect(BANNED_MONIKERS.length).toBeGreaterThan(30);
  });
});
