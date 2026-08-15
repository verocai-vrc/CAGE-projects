// matchmaking.ts — Loop 3.3: procedural opponent generation + offer quality
// (DESIGN.md §8.4). Opponents are generated from nationality-weighted name
// pools and archetype templates, never hand-authored. Offer quality scales
// with the player's ranking and hype; life-bar neglect further degrading
// offers is M4 (§8.3), not this loop's concern.

import type { RNG } from '../engine';
import type { ArchetypeId, Attributes, Fighter, WeightClass } from '../engine/types';

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
}

// Pure given rng: builds one schema-valid Fighter from a weighted archetype
// pick + a weighted nationality/name pick. No engine content is imported
// directly — callers pass in the archetype/name pools (from content/index.ts
// in real use, fixtures in tests) so this file stays testable in isolation.
export function generateOpponent(
  archetypes: readonly ArchetypeTemplate[],
  namePools: readonly NamePool[],
  rng: RNG,
  options: GenerateOpponentOptions,
): Fighter {
  const archetype = weightedPick(archetypes, rng);
  const namePool = weightedPick(namePools, rng);
  const firstName = namePool.firstNames[Math.floor(rng.next() * namePool.firstNames.length)];
  const lastName = namePool.lastNames[Math.floor(rng.next() * namePool.lastNames.length)];
  const stance = rng.next() < 0.85 ? 'orthodox' : 'southpaw';
  const idSuffix = Math.floor(rng.next() * 1e9).toString(36);

  return {
    id: `${options.idPrefix ?? 'opp'}-${idSuffix}`,
    name: `${firstName} ${lastName}`,
    nationality: namePool.nationality,
    weightClass: options.weightClass,
    stance,
    attributes: jitterAttributes(archetype.attributes, rng),
    archetype: archetype.id,
    weakness: null,
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
): MatchOffer[] {
  const offers: MatchOffer[] = [];
  const usedNames = new Set<string>();
  const { purse, hypeReward } = offerQuality(options.ranking, options.hype, balance, options.sponsorMultiplier);

  let attempts = 0;
  const maxAttempts = count * 50;
  while (offers.length < count && attempts < maxAttempts) {
    attempts++;
    const opponent = generateOpponent(archetypes, namePools, rng, options);
    if (usedNames.has(opponent.name)) continue;
    usedNames.add(opponent.name);
    offers.push({ opponent, purse, hypeReward });
  }

  return offers;
}
