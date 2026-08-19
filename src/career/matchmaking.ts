// matchmaking.ts — Loop 3.3: procedural opponent generation + offer quality
// (DESIGN.md §8.4). Opponents are generated from nationality-weighted name
// pools and archetype templates, never hand-authored. Offer quality scales
// with the player's ranking and hype; life-bar neglect further degrading
// offers is M4 (§8.3), not this loop's concern.

import type { RNG } from '../engine';
import type { ArchetypeId, Attributes, Fighter, FightRecord, WeaknessId, WeightClass } from '../engine/types';
import { nicknameFor } from './identity';

export interface ArchetypeTemplate {
  id: ArchetypeId;
  weight: number;
  attributes: Attributes;
}

export interface NamePool {
  nationality: string;
  weight: number;
  firstNames: string[];
  lastNames: string[];
}

// Bounded per-attribute jitter applied on top of an archetype template so
// generated opponents aren't exact stat clones of each other.
const ATTRIBUTE_VARIANCE = 6;

// Loop 7.3 (§16.5). Opponents used to be hardcoded `weakness: null`, which made
// the player's own weakness a unilateral handicap — theirs was a real engine
// penalty (fight.ts) and nobody else in the game had one. These are the same
// three ids content/events/amateur.json can award the player, so scouting
// (Loop 8.5) has something true to point at on either side of the cage.
//
// Not every fighter has an exploitable hole: WEAKNESS_CHANCE of them do. A
// weakness on everyone is worth the same as a weakness on no one, and the
// fighter with no named hole should read as the harder night's work.
const WEAKNESS_IDS: readonly WeaknessId[] = ['striking-defense', 'takedown-defense', 'submission-defense'];
const WEAKNESS_CHANCE = 0.55;

// Two draws, always both, whatever the first returns — keeping rng consumption
// per opponent constant so adding this could not shift any later draw in the
// stream (the same discipline resolveMoment follows in the engine).
function drawWeakness(rng: RNG): WeaknessId | null {
  const has = rng.next() < WEAKNESS_CHANCE;
  const pick = WEAKNESS_IDS[Math.floor(rng.next() * WEAKNESS_IDS.length)];
  return has ? pick : null;
}

function weightedPick<T extends { weight: number }>(items: readonly T[], rng: RNG): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng.next() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function jitterAttribute(value: number, rng: RNG): number {
  const delta = Math.round((rng.next() * 2 - 1) * ATTRIBUTE_VARIANCE);
  return Math.max(0, Math.min(100, value + delta));
}

function jitterAttributes(base: Attributes, rng: RNG): Attributes {
  return {
    power: jitterAttribute(base.power, rng),
    technique: jitterAttribute(base.technique, rng),
    speed: jitterAttribute(base.speed, rng),
    wrestling: jitterAttribute(base.wrestling, rng),
    groundControl: jitterAttribute(base.groundControl, rng),
    chin: jitterAttribute(base.chin, rng),
    cardio: jitterAttribute(base.cardio, rng),
    fightIQ: jitterAttribute(base.fightIQ, rng),
  };
}

export interface GenerateOpponentOptions {
  weightClass: WeightClass;
  idPrefix?: string;
  /** The ladder position this opponent is drawn for — 1 is the champion, higher
   *  is further down, `null` is unranked. Scales their record (§16.5). Defaults
   *  to unranked, so existing callers get the bottom-of-the-ladder shape. */
  ranking?: number | null;
}

// Loop 7.4 (§16.5). Opponents had no record at all, which left FighterIdentity's
// record slot unfillable and made an opponent unreadable as a person: a name and
// a face with no history behind them.
//
// A record is a compressed career. It has to say two things at a glance — how
// long they have been doing this, and how well — and both scale with where they
// sit on the ladder. A #1 contender with a 3-1 record reads as a matchmaking
// error; a #15 with 28 fights reads as a journeyman, which is exactly right.

/** 1 at the top of the ladder, ~0 at the bottom and for the unranked. */
function ladderStrength(ranking: number | null | undefined): number {
  if (ranking === null || ranking === undefined) return 0;
  return Math.max(0, Math.min(1, (LADDER_DEPTH + 1 - ranking) / LADDER_DEPTH));
}

const LADDER_DEPTH = 15; // matches balance.json's unrankedEntryRanking
const MIN_FIGHTS = 4; // nobody debuts against the player — no opponent is 0-0
const MAX_EXTRA_FIGHTS = 22; // a champion has ~26 fights, a #15 around 6

// Exactly four draws, always all four, on every path — rng consumption per
// opponent stays constant so adding a record could not shift a later draw in
// the stream (the same discipline drawWeakness follows).
function drawRecord(rng: RNG, ranking: number | null | undefined): FightRecord {
  const strength = ladderStrength(ranking);

  const total = MIN_FIGHTS + Math.round(strength * MAX_EXTRA_FIGHTS + rng.next() * 4);
  // 45% at the bottom of the ladder up to 80% at the top, ±5 points of jitter,
  // so two fighters at the same rank do not read as the same fighter.
  const winShare = 0.45 + strength * 0.35 + (rng.next() - 0.5) * 0.1;
  const draws = rng.next() < 0.09 ? 1 : 0;
  const noContests = rng.next() < 0.04 ? 1 : 0;

  // At least one win and at least one loss: an undefeated opponent is a
  // different story beat than this function is for, and a winless one would
  // never have been offered the fight.
  const decided = total - draws - noContests;
  const wins = Math.max(1, Math.min(decided - 1, Math.round(decided * winShare)));

  return { wins, losses: decided - wins, draws, noContests };
}

// Pure given rng: builds one schema-valid Fighter from a weighted archetype
// pick + a weighted nationality/name pick. No engine content is imported
// directly — callers pass in the archetype/name pools (from content/index.ts
// in real use, fixtures in tests) so this file stays testable in isolation.
//
// `drawFace` follows the same pattern for Loop 6.4's face: matchmaking.ts stays
// decoupled from ui/portrait by taking the draw function as a parameter rather
// than importing it, exactly like archetypes/namePools above. Callers pass
// `faceFromSeed` + `serializeFaceCode` composed together (career/progression.ts
// does, for the real app); tests can pass a fixed stub.
export function generateOpponent(
  archetypes: readonly ArchetypeTemplate[],
  namePools: readonly NamePool[],
  rng: RNG,
  options: GenerateOpponentOptions,
  drawFace: (rng: RNG) => string,
): Fighter {
  const archetype = weightedPick(archetypes, rng);
  const namePool = weightedPick(namePools, rng);
  const firstName = namePool.firstNames[Math.floor(rng.next() * namePool.firstNames.length)];
  const lastName = namePool.lastNames[Math.floor(rng.next() * namePool.lastNames.length)];
  const stance = rng.next() < 0.85 ? 'orthodox' : 'southpaw';
  const idSuffix = Math.floor(rng.next() * 1e9).toString(36);
  // Drawn from the same seeded stream as everything else about this opponent, in
  // the same fixed order every time, so a given seed always reproduces the same
  // face alongside the same name and attributes (§15.4's determinism promise).
  const face = drawFace(rng);
  const weakness = drawWeakness(rng);
  const record = drawRecord(rng, options.ranking);
  // Loop 7.6 (§16.5): drawn last, from the same stream, so the earlier draws
  // are bit-identical to what they were before nicknames existed.
  const nickname = nicknameFor(rng, archetype.id, namePool.nationality);

  return {
    id: `${options.idPrefix ?? 'opp'}-${idSuffix}`,
    name: `${firstName} ${lastName}`,
    nickname,
    nationality: namePool.nationality,
    face,
    weightClass: options.weightClass,
    stance,
    attributes: jitterAttributes(archetype.attributes, rng),
    archetype: archetype.id,
    weakness,
    record,
    traits: [],
    condition: { health: 100, injuries: [] },
  };
}

export interface MatchOffer {
  opponent: Fighter;
  purse: number;
  hypeReward: number;
}

export interface MatchmakingBalance {
  baseOfferPurse: number;
  offerPursePerRankingPoint: number;
  offerPursePerHype: number;
  baseHypeReward: number;
}

// Ranking is 1 (champion) .. N (unranked-ish); lower is better, so offer
// quality scales inversely with ranking distance from the top plus linearly
// with hype. Unranked (null) fighters get the worst-case offer floor.
// `sponsorMultiplier` (Loop 4.1, DESIGN.md §8.3) scales the purse down for a
// neglected sponsors life bar — defaults to 1 (no penalty) so existing
// callers are unaffected; life.ts's sponsorPurseMultiplier is the intended
// source of a real value.
export function offerQuality(
  ranking: number | null,
  hype: number,
  balance: MatchmakingBalance,
  sponsorMultiplier: number = 1,
): { purse: number; hypeReward: number } {
  const rankingFactor = ranking === null ? 0 : Math.max(0, 30 - ranking);
  const purse = Math.max(
    0,
    Math.round(
      (balance.baseOfferPurse +
        rankingFactor * balance.offerPursePerRankingPoint +
        hype * balance.offerPursePerHype) *
        sponsorMultiplier,
    ),
  );
  const hypeReward = Math.max(0, Math.round(balance.baseHypeReward + rankingFactor * 0.2));
  return { purse, hypeReward };
}

// Generates a slate of N distinct-named opponents with offers scaled by the
// player's current ranking/hype. Retries on name collisions within the slate
// (nationality+name pools are small fixtures, so a naive reject-and-resample
// is simpler and cheaper than tracking used first/last-name combinations).
export function generateMatchSlate(
  archetypes: readonly ArchetypeTemplate[],
  namePools: readonly NamePool[],
  rng: RNG,
  count: number,
  options: GenerateOpponentOptions & { ranking: number | null; hype: number; sponsorMultiplier?: number },
  balance: MatchmakingBalance,
  drawFace: (rng: RNG) => string,
): MatchOffer[] {
  const offers: MatchOffer[] = [];
  const usedNames = new Set<string>();
  const { purse, hypeReward } = offerQuality(options.ranking, options.hype, balance, options.sponsorMultiplier);

  let attempts = 0;
  const maxAttempts = count * 50;
  while (offers.length < count && attempts < maxAttempts) {
    attempts++;
    const opponent = generateOpponent(archetypes, namePools, rng, options, drawFace);
    if (usedNames.has(opponent.name)) continue;
    usedNames.add(opponent.name);
    offers.push({ opponent, purse, hypeReward });
  }

  return offers;
}
