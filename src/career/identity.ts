// identity.ts — Loop 7.5: style descriptors and scouting fidelity (§16.5, §6.6).
//
// TWO RULES GOVERN THIS FILE, AND BOTH ARE LOAD-BEARING.
//
// 1. "Style descriptors must be computations, not adjectives. Each descriptor
//    is a predicate over real `Attributes`; there is no descriptor without one."
//    §16.5 cuts, by name, anything about heart, killer instinct, fight-week
//    discipline, or durability-under-pressure — they are not in `Attributes`,
//    they are not in `Origin`, and inventing them makes the scout card
//    decorative, "which is the exact failure this section exists to prevent."
//    So DESCRIPTORS below is the whole vocabulary, every entry carries its own
//    `test`, and adding a label without a predicate is not possible here.
//
// 2. `fightIQ` is fidelity, not a bonus (§6.6): "Implement IQ as the fidelity of
//    information surfaced to the player, not as a hidden +X on rolls." A
//    low-IQ fighter is not weaker — they are *misinformed*. Below 45 the scout
//    card shows one tendency the opponent does not actually have, rendered with
//    identical confidence to the true one. Nothing marks it. That is the point:
//    a tell the player could spot would be information, not the absence of it.
//
// NOT YET CALLED BY ANYTHING. The ScoutCard that renders these is Loop 8.5 and
// the offers screen that reaches it is Loop 8.1, so as of Loop 7.5 this module
// is tree-shaken out of the bundle entirely — the build's entry chunk is
// byte-identical with and without it. That is the same shape of gap §16.1
// called out as a defect for persist.ts ("complete, tested, and called by no
// application code"), and it is recorded here rather than left to be
// rediscovered. The difference is that it is scheduled: DEVELOPMENT_LOOPS.md's
// M7 gate (Loop 7.18) requires the driver to walk hub -> offers -> scout by
// clicking, which cannot pass while this has no caller.

import type { Attributes, Fighter, RNG } from '../engine';
import { computePillars } from '../engine';
import { nicknames } from '../content';

export type DescriptorId =
  | 'pressure-striker'
  | 'technician'
  | 'chain-wrestler'
  | 'top-control-grinder'
  | 'front-runner'
  | 'late-rounds-grinder'
  | 'granite'
  | 'suspect-chin'
  | 'reads-the-fight';

export interface Descriptor {
  id: DescriptorId;
  /** What the scout card prints. */
  label: string;
  /** The predicate. Every descriptor has one — see rule 1 above. */
  test: (attributes: Attributes) => boolean;
}

/**
 * §16.5's table, transcribed. `striking` is the pillar (§4.1 —
 * `(power + technique + speed) / 3`); every other name in a predicate is a raw
 * attribute. The order is the table's order and is not meaningful: selection
 * shuffles.
 */
export const DESCRIPTORS: readonly Descriptor[] = Object.freeze([
  {
    id: 'pressure-striker',
    label: 'Pressure striker',
    test: (a) => computePillars(a).striking >= 60 && a.power >= a.technique,
  },
  {
    id: 'technician',
    label: 'Technician',
    test: (a) => a.technique >= 70 && a.technique - a.power >= 15,
  },
  { id: 'chain-wrestler', label: 'Chain wrestler', test: (a) => a.wrestling >= 70 },
  {
    id: 'top-control-grinder',
    label: 'Top-control grinder',
    test: (a) => a.groundControl >= 70 && a.groundControl > a.wrestling,
  },
  { id: 'front-runner', label: 'Front-runner', test: (a) => a.cardio <= 50 && a.speed >= 60 },
  { id: 'late-rounds-grinder', label: 'Late-rounds grinder', test: (a) => a.cardio >= 70 },
  { id: 'granite', label: 'Granite', test: (a) => a.chin >= 75 },
  { id: 'suspect-chin', label: 'Suspect chin', test: (a) => a.chin <= 45 },
  { id: 'reads-the-fight', label: 'Reads the fight', test: (a) => a.fightIQ >= 70 },
]);

/** Every descriptor this attribute set actually satisfies. The truth, before
 *  fidelity is applied to it. */
export function descriptorsFor(attributes: Attributes): Descriptor[] {
  return DESCRIPTORS.filter((descriptor) => descriptor.test(attributes));
}

/** Every descriptor it does not — the pool a low-fightIQ read draws its wrong
 *  answer from. */
export function failedDescriptorsFor(attributes: Attributes): Descriptor[] {
  return DESCRIPTORS.filter((descriptor) => !descriptor.test(attributes));
}

// --- Scouting fidelity (§16.5's second table, §6.6) ---

/** §16.5's three tiers, as data so the test can walk them rather than restate them. */
export const FIDELITY_TIERS = Object.freeze([
  { minFightIQ: 70, count: 3, falseTendencies: 0 },
  { minFightIQ: 45, count: 2, falseTendencies: 0 },
  { minFightIQ: -Infinity, count: 2, falseTendencies: 1 },
] as const);

export function fidelityFor(playerFightIQ: number): (typeof FIDELITY_TIERS)[number] {
  return FIDELITY_TIERS.find((tier) => playerFightIQ >= tier.minFightIQ) ?? FIDELITY_TIERS[2];
}

// Fisher-Yates against the supplied stream. Copies rather than sorting in
// place, so a caller's DESCRIPTORS slice is never reordered under them.
function shuffled<T>(items: readonly T[], rng: RNG): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface Tendency {
  id: DescriptorId;
  label: string;
  /**
   * Whether the opponent actually satisfies this predicate.
   *
   * NEVER RENDER THIS. It exists so tests can assert §16.5's accuracy column
   * and so the aftermath could one day show the player what they got wrong.
   * §16.5 requires a false tendency be "shown with identical confidence" — a
   * scout card that styles this differently has broken the mechanic.
   */
  true: boolean;
}

/**
 * What the player learns about an opponent before the bout (§16.5, §6.6).
 *
 * How many, and how honest, is decided entirely by the *player's* `fightIQ` —
 * never the opponent's. Scouting is a thing the player does.
 *
 * Total by construction: a bland opponent who satisfies no predicate yields
 * fewer tendencies than the tier asks for rather than inventing one, because
 * inventing one is exactly what rule 1 forbids. §16.5's empty state belongs to
 * the ScoutCard (Loop 8.5), not here.
 */
export function tendenciesFor(opponent: Fighter, playerFightIQ: number, rng: RNG): Tendency[] {
  const tier = fidelityFor(playerFightIQ);
  const satisfied = shuffled(descriptorsFor(opponent.attributes), rng);
  const failed = shuffled(failedDescriptorsFor(opponent.attributes), rng);

  const trueCount = Math.min(tier.count - tier.falseTendencies, satisfied.length);
  const picked: Tendency[] = satisfied
    .slice(0, trueCount)
    .map((d) => ({ id: d.id, label: d.label, true: true }));

  for (let i = 0; i < tier.falseTendencies && i < failed.length; i++) {
    picked.push({ id: failed[i].id, label: failed[i].label, true: false });
  }

  // The false one must not be predictable by position — a player who learned
  // "the last one is always the lie" would have perfect information from an
  // imperfect stat. Shuffled even when everything is true, so the shape of the
  // output tells you nothing about which tier produced it.
  return shuffled(picked, rng);
}

// --- Nicknames (§16.5) ---
//
// "Roughly 65% of fighters get one — universal nicknames devalue the nickname."
// The rate is a design rule rather than a tuning knob, so it lives here as a
// named constant and not in balance.json: nothing about it is balance, and a lab
// run would have nothing to say about it.
//
// The pools are deliberately mundane — Overtime, The Landlord, Copper Bell. A
// nickname has to survive being said in a commentary line six fights later
// (§16.6), and it has to be nobody's. §13 forbids modelling real athletes, so
// the whole product space of {adjective} x {noun} is checked against the
// trademark denylist in CI (scripts/check-content.mjs) rather than trusted to
// authoring discipline — the combinations are what a human author cannot hold
// in their head.
export const NICKNAME_CHANCE = 0.65;

const LEAN_MULTIPLIER = 3;

interface NicknamePart {
  word: string;
  weight: number;
  archetypes?: string[];
  nationalities?: string[];
}

/** Base weight, tripled for each of archetype and nationality it leans toward.
 *  A lean is a thumb on the scale, never a filter — see NicknameContentSchema. */
function effectiveWeight(part: NicknamePart, archetype: string, nationality: string): number {
  let weight = part.weight;
  if (part.archetypes?.includes(archetype)) weight *= LEAN_MULTIPLIER;
  if (part.nationalities?.includes(nationality)) weight *= LEAN_MULTIPLIER;
  return weight;
}

function pickWeighted(
  parts: readonly NicknamePart[],
  archetype: string,
  nationality: string,
  rng: RNG,
): string {
  const total = parts.reduce((sum, part) => sum + effectiveWeight(part, archetype, nationality), 0);
  let roll = rng.next() * total;
  for (const part of parts) {
    roll -= effectiveWeight(part, archetype, nationality);
    if (roll <= 0) return part.word;
  }
  return parts[parts.length - 1].word;
}

/**
 * A fighter's nickname, or `null` for the ~35% who do not get one (§16.5).
 *
 * Exactly five draws on every path, including the ~35% that return null, so the
 * caller's stream advances by a fixed amount — the same discipline drawWeakness
 * and drawRecord follow in matchmaking.ts. Adding a nickname must not be able to
 * change the face or the record generated after it. That is why all three parts
 * are drawn before either branch is taken and two of them are then discarded.
 */
export function nicknameFor(rng: RNG, archetype: string, nationality: string): string | null {
  const assigned = rng.next() < NICKNAME_CHANCE;
  const twoPart = rng.next() < nicknames.twoPartChance;
  const adjective = pickWeighted(nicknames.adjectives, archetype, nationality, rng);
  const noun = pickWeighted(nicknames.nouns, archetype, nationality, rng);
  const solo = pickWeighted(nicknames.standalone, archetype, nationality, rng);

  if (!assigned) return null;
  return twoPart ? `${adjective} ${noun}` : solo;
}
