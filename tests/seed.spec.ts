// seed.spec.ts — Loop 7.1: DESIGN.md §16.2's determinism contract, extended
// from one bout to a whole career.
//
// Before this loop, three call sites seeded their streams from `Date.now()`, so
// two careers started from the same inputs diverged on the first fight. The
// tests here are the ones that could not have passed then: same seed in, same
// opponents, same offers, same event deck, same bouts, same aftermath.
//
// This is the career-level twin of tests/fight.spec.ts's byte-identical log
// test, and DEVELOPMENT_LOOPS.md's "Determinism spot-check" cross-cutting loop
// covers both.

/// <reference types="node" />

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { simulateFight } from '../src/engine';
import type { Fighter, Tactics } from '../src/engine/types';
import { archetypes, amateurMoments, balance, lifeEvents, namePools } from '../src/content';
import { careerRng, originRng, rollCareerSeed, type SeedPurpose } from '../src/career/seed';
import { generateOpponent, offerQuality } from '../src/career/matchmaking';
import { applyAftermath, startCareer } from '../src/career/progression';
import { rollRandomOrigin } from '../src/career/origin';
import { buildDailySetup, todayDateString } from '../src/career/daily';
import { faceFromSeed, serializeFaceCode } from '../src/ui/portrait/faceCode';
import { sponsorPurseMultiplier } from '../src/career/life';
import type { CareerState } from '../src/state/store';

/** The skip path, exactly as CareerScreen runs it. */
function startFromSeed(seed: string): CareerState {
  const rng = originRng(seed);
  const origin = rollRandomOrigin(amateurMoments, rng);
  const face = serializeFaceCode(faceFromSeed(rng));
  return startCareer(origin, seed, 'player-1', 'Your Fighter', { face });
}

/** One fight resolved off a career, exactly as CareerScreen's
 *  findFightAndResolve does: opponent, bout and injury on separate streams. */
function resolveOneFight(career: CareerState) {
  const player = career.player!;
  const boutIndex = career.fightHistory.length;

  const opponent = generateOpponent(
    archetypes,
    namePools,
    careerRng(career.seed, 'opponent', boutIndex),
    { weightClass: player.weightClass, idPrefix: 'opp' },
    (faceRng) => serializeFaceCode(faceFromSeed(faceRng)),
  );
  const offer = offerQuality(career.ranking, career.hype, balance, sponsorPurseMultiplier(career.lifeBars));
  const tactics: Tactics = { [player.id]: { cutQuality: 'clean', rounds: {} } };
  const result = simulateFight(player, opponent, tactics, careerRng(career.seed, 'bout', boutIndex));
  const after = applyAftermath(
    career,
    player,
    result,
    offer,
    balance,
    careerRng(career.seed, 'injury', boutIndex),
  );
  return { opponent, offer, result, after };
}

/** Play `n` fights off one seed and record everything a player would notice. */
function playCareer(seed: string, fights: number) {
  let career = startFromSeed(seed);
  const opponents: Fighter[] = [];
  const offers: { purse: number; hypeReward: number }[] = [];
  const methods: string[] = [];

  for (let i = 0; i < fights; i++) {
    const { opponent, offer, result, after } = resolveOneFight(career);
    opponents.push(opponent);
    offers.push(offer);
    methods.push(`${result.method}:${result.winnerId}`);
    career = after;
  }

  return { career, opponents, offers, methods };
}

describe('careerRng derives a stream from (seed, purpose, index)', () => {
  it('is stable across calls for the same triple', () => {
    const a = careerRng('SEED', 'opponent', 3);
    const b = careerRng('SEED', 'opponent', 3);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('separates purposes, so a draw added to one cannot shift another', () => {
    // The property that makes streams addressable rather than sequential: this
    // is what lets a reload re-derive the third opponent without replaying the
    // first two (§16.2's resume model).
    const purposes: SeedPurpose[] = ['origin', 'gym', 'coach', 'opponent', 'bout', 'narration', 'event', 'injury'];
    const firstDraws = purposes.map((purpose) => careerRng('SEED', purpose, 0).next());
    expect(new Set(firstDraws).size).toBe(purposes.length);
  });

  it('separates indices within a purpose', () => {
    const draws = Array.from({ length: 12 }, (_, i) => careerRng('SEED', 'opponent', i).next());
    expect(new Set(draws).size).toBe(12);
  });

  it('separates seeds', () => {
    expect(careerRng('SEED-A', 'bout', 0).next()).not.toBe(careerRng('SEED-B', 'bout', 0).next());
  });
});

describe('a whole career is reproducible from its seed (§16.2)', () => {
  // The headline test. Before Loop 7.1 the opponents alone would differ on
  // every run, because CareerScreen seeded them from Date.now().
  it('produces identical opponents, offers and bouts from the same seed', () => {
    const first = playCareer('REPRO-SEED', 6);
    const second = playCareer('REPRO-SEED', 6);

    expect(second.opponents).toEqual(first.opponents);
    expect(second.offers).toEqual(first.offers);
    expect(second.methods).toEqual(first.methods);
    // Not just the visible draws — the entire resulting career state.
    expect(second.career).toEqual(first.career);
  });

  it('produces a different career from a different seed', () => {
    const a = playCareer('SEED-A', 6);
    const b = playCareer('SEED-B', 6);
    expect(b.opponents.map((o) => o.name)).not.toEqual(a.opponents.map((o) => o.name));
  });

  it('gives the same seed the same fighter, face included', () => {
    expect(startFromSeed('FACE-SEED').player).toEqual(startFromSeed('FACE-SEED').player);
    expect(startFromSeed('FACE-SEED').player!.face).not.toBe(startFromSeed('OTHER-SEED').player!.face);
  });

  it('records the seed on the career it produced', () => {
    expect(startFromSeed('KEPT-SEED').seed).toBe('KEPT-SEED');
  });
});

describe('a daily run is shared for the whole run, not just the prospect', () => {
  // §16.2's specific complaint: the M5 daily seeded the origin from the date and
  // the fights from the clock, which made it "a shared origin with private
  // fights" — two players comparing results were not playing the same daily.
  const DATE = '2026-08-18';

  it('gives every player on a date the same prospect, event deck and fights', () => {
    const setupA = buildDailySetup(DATE, amateurMoments, lifeEvents);
    const setupB = buildDailySetup(DATE, amateurMoments, lifeEvents);
    expect(setupB.eventDeckOrder).toEqual(setupA.eventDeckOrder);
    expect(setupB.origin).toEqual(setupA.origin);

    const runA = playCareer(DATE, 5);
    const runB = playCareer(DATE, 5);
    expect(runB.opponents).toEqual(runA.opponents);
    expect(runB.methods).toEqual(runA.methods);
  });

  it('gives a different date a different run', () => {
    const today = buildDailySetup(DATE, amateurMoments, lifeEvents);
    const tomorrow = buildDailySetup('2026-08-19', amateurMoments, lifeEvents);
    expect(tomorrow.eventDeckOrder).not.toEqual(today.eventDeckOrder);
    expect(playCareer('2026-08-19', 4).opponents.map((o) => o.name)).not.toEqual(
      playCareer(DATE, 4).opponents.map((o) => o.name),
    );
  });
});

describe('the clock is not a source of randomness anywhere in src/ (§16.2)', () => {
  // The structural version of Loop 7.1's grep verify. A comment cannot fail a
  // build; this can. Loop 6.12 is the precedent — the purity rule for /engine
  // has been enforced rather than promised since Loop 0, and this is the same
  // rule widened to the career layer, where the clock is what made a run
  // unreproducible.
  const CLOCK = /\bDate\.now\s*\(|\bnew\s+Date\s*\(/;

  // The one sanctioned reader: career/daily.ts's todayDateString(), which asks
  // what day it is. That is a legitimate question — everything else derives
  // from a seed.
  const EXEMPT = 'src/career/daily.ts';

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return /\.(ts|tsx)$/.test(entry) ? [full] : [];
    });
  }

  /** Strip comments so a file discussing `Date.now()` is not mistaken for one
   *  calling it — several now do, explaining why they stopped. */
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  }

  it('finds no clock read outside the daily-date helper', () => {
    const root = fileURLToPath(new URL('../src', import.meta.url));
    const offenders = sourceFiles(root)
      .filter((file) => CLOCK.test(stripComments(readFileSync(file, 'utf-8'))))
      .map((file) => relative(fileURLToPath(new URL('..', import.meta.url)), file).replace(/\\/g, '/'));

    expect(offenders).toEqual([EXEMPT]);
  });

  it('the exempt helper answers only "what day is it"', () => {
    // If daily.ts ever grows a second clock read, the exemption above stops
    // being a narrow carve-out — so the count is pinned too.
    const source = stripComments(
      readFileSync(fileURLToPath(new URL('../src/career/daily.ts', import.meta.url)), 'utf-8'),
    );
    expect(source.match(new RegExp(CLOCK, 'g'))).toHaveLength(1);
    expect(todayDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('rollCareerSeed', () => {
  it('produces distinct, legible seeds', () => {
    const seeds = Array.from({ length: 500 }, () => rollCareerSeed());
    // Collisions at 31^10 are vanishingly unlikely; a repeat here means the
    // roll is not actually random (the Date.now() failure mode this replaced,
    // where two careers started in the same millisecond shared a seed).
    expect(new Set(seeds).size).toBe(seeds.length);
    // No 0/O/1/I/L — a seed is shown on the career card and typed back in.
    for (const seed of seeds.slice(0, 50)) expect(seed).toMatch(/^[2-9A-HJ-NP-Z]{10}$/);
  });

  it('seeds a career that is then fully reproducible', () => {
    const seed = rollCareerSeed();
    expect(playCareer(seed, 4).career).toEqual(playCareer(seed, 4).career);
  });
});
