import { z } from 'zod';
import type { Attributes, Fighter, Origin, FightResult } from '../engine/types';

export const AttributesSchema = z.object({
  power: z.number().int().min(0).max(100),
  technique: z.number().int().min(0).max(100),
  speed: z.number().int().min(0).max(100),
  wrestling: z.number().int().min(0).max(100),
  groundControl: z.number().int().min(0).max(100),
  chin: z.number().int().min(0).max(100),
  cardio: z.number().int().min(0).max(100),
  fightIQ: z.number().int().min(0).max(100),
}) satisfies z.ZodType<Attributes>;

export const InjurySchema = z.object({
  id: z.string(),
  bodyPart: z.string(),
  severity: z.number().min(0).max(100),
  weeksRemaining: z.number().int().min(0),
});

export const FighterSchema = z.object({
  id: z.string(),
  name: z.string(),
  nationality: z.string(),
  weightClass: z.string(),
  stance: z.enum(['orthodox', 'southpaw']),
  attributes: AttributesSchema,
  archetype: z.string(),
  weakness: z.string().nullable(),
  traits: z.array(z.string()),
  condition: z.object({
    health: z.number().min(0).max(100),
    injuries: z.array(InjurySchema),
  }),
}) satisfies z.ZodType<Fighter>;

export const OriginSchema = z.object({
  statDeltas: AttributesSchema.partial(),
  archetype: z.string(),
  weakness: z.string().nullable(),
  mentorGymId: z.string(),
  hypeModifier: z.number(),
  amateurRecord: z.object({
    wins: z.number().int().min(0),
    losses: z.number().int().min(0),
  }),
}) satisfies z.ZodType<Origin>;

const FightMethodSchema = z.enum(['KO', 'TKO', 'SUB', 'UD', 'SD', 'MD', 'DRAW']);

export const FightEventSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('strike'),
    by: z.string(),
    kind: z.string(),
    landed: z.boolean(),
    damage: z.number(),
    round: z.number().int(),
  }),
  z.object({ t: z.literal('takedown'), by: z.string(), success: z.boolean(), round: z.number().int() }),
  z.object({
    t: z.literal('position'),
    state: z.enum(['standing', 'clinch', 'topControl', 'bottomControl']),
    round: z.number().int(),
  }),
  z.object({ t: z.literal('knockdown'), who: z.string(), round: z.number().int() }),
  z.object({
    t: z.literal('submissionAttempt'),
    by: z.string(),
    escaped: z.boolean(),
    round: z.number().int(),
  }),
  z.object({ t: z.literal('cornerCall'), round: z.number().int(), tacticId: z.string() }),
  z.object({
    t: z.literal('playerMoment'),
    round: z.number().int(),
    kind: z.enum(['scramble', 'submissionEscape', 'finishingSequence']),
    outcome: z.enum(['success', 'fail']),
  }),
  z.object({
    t: z.literal('roundEnd'),
    round: z.number().int(),
    scoreA: z.number(),
    scoreB: z.number(),
  }),
  z.object({
    t: z.literal('finish'),
    who: z.string(),
    method: z.string(),
    round: z.number().int(),
  }),
]);

export const ScorecardSchema = z.object({
  judgeId: z.string(),
  roundScores: z.array(z.object({ a: z.number(), b: z.number() })),
});

export const FightSummarySchema = z.object({
  seed: z.string(),
  fighterAId: z.string(),
  fighterBId: z.string(),
  winnerId: z.string().nullable(),
  method: FightMethodSchema,
  endRound: z.number().int().min(1),
  scorecardTotals: z.array(z.object({ judgeId: z.string(), a: z.number(), b: z.number() })),
});

export const FightResultSchema = z.object({
  seed: z.string(),
  winnerId: z.string().nullable(),
  method: FightMethodSchema,
  endRound: z.number().int().min(1),
  scorecards: z.array(ScorecardSchema),
  events: z.array(FightEventSchema),
  summary: FightSummarySchema,
}) satisfies z.ZodType<FightResult>;

// Content-file schemas (not part of the §4 data model, but validated at boot
// alongside it — see content/load.ts).
export const AttributeMetaSchema = z.object({
  id: z.string(),
  label: z.string(),
  pillar: z.enum(['striking', 'grappling', 'durability', 'mind']),
});

export const ArchetypeSchema = z.object({
  id: z.string(),
  label: z.string(),
  attributes: AttributesSchema,
});

export const BalanceSchema = z.object({
  k: z.number(),
  kFinish: z.number(),
  staminaDrainBase: z.number(),
  cardioDrainScale: z.number(),
  cutPenaltyBotched: z.number(),
  cutPenaltyClean: z.number(),
  traitUnlockThreshold: z.number(),
  maxEquippedTraits: z.number().int(),
  fadedStaminaThreshold: z.number(),
  weeklyDecay: z.object({
    partner: z.number(),
    hype: z.number(),
    sponsor: z.number(),
    trainingPartners: z.number(),
  }),
});
