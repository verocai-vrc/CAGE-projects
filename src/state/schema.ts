import { z } from 'zod';
import type { Attributes, Fighter, Origin, FightResult } from '../engine/types';
import type { CareerState } from './store';

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
  nickname: z.string().nullable(),
  nationality: z.string(),
  face: z.string(),
  weightClass: z.string(),
  stance: z.enum(['orthodox', 'southpaw']),
  attributes: AttributesSchema,
  archetype: z.string(),
  weakness: z.string().nullable(),
  // Loop 7.4 (§16.5) — moved here from CareerState, and now carried by
  // generated opponents too. Declared below FighterSchema in source order, so
  // it is inlined rather than referencing CareerRecordSchema.
  record: z.object({
    wins: z.number().int().min(0),
    losses: z.number().int().min(0),
    draws: z.number().int().min(0),
    noContests: z.number().int().min(0),
  }),
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
    index: z.number().int().min(0),
    kind: z.enum(['scramble', 'submissionEscape', 'finishingSequence']),
    outcome: z.enum(['success', 'fail']),
    played: z.boolean(),
  }),
  z.object({
    t: z.literal('roundEnd'),
    round: z.number().int(),
    scoreA: z.number(),
    scoreB: z.number(),
    staminaA: z.number(),
    staminaB: z.number(),
  }),
  z.object({
    t: z.literal('checkEnd'),
    round: z.number().int(),
    check: z.number().int().min(1),
    strikesA: z.number(),
    strikesB: z.number(),
    controlA: z.number(),
    controlB: z.number(),
    winner: z.enum(['a', 'b', 'even']),
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
  knockdownsA: z.number().int().min(0),
  knockdownsB: z.number().int().min(0),
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

// state/store.ts's CareerState — the shape persisted to localStorage (§11).
// Event logs are never part of this: fightHistory holds FightSummary only.
export const CareerRecordSchema = z.object({
  wins: z.number().int().min(0),
  losses: z.number().int().min(0),
  draws: z.number().int().min(0),
  noContests: z.number().int().min(0),
});

export const LifeBarsSchema = z.object({
  trainingPartners: z.number().min(0).max(100),
  partner: z.number().min(0).max(100),
  sponsors: z.number().min(0).max(100),
});

// Loop 7.8 (§16.8): a gym. Declared above CareerStateSchema because a career
// that has moved gyms carries the gym itself (`currentGym`) — a procedural gym
// exists in no content file, so it cannot be re-resolved from its id alone. The
// content pools that generate them live with the other content schemas below.
export const GymSpecialtySchema = z.enum(['striking', 'grappling', 'conditioning']);

export const GymSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  city: z.string().min(1),
  country: z.string().min(1),
  specialty: GymSpecialtySchema,
  reputation: z.number().min(0).max(100),
  dues: z.number().min(0),
});

// Loop 7.9 (§16.8): the coach. Unlike the gym there are no authored anchors —
// the amateur wrapper names gyms in its prose but never a coach, so every coach
// in the game is procedural. Declared above CareerStateSchema because that
// schema embeds it; the content pools live with the other content schemas below.
export const CoachBackgroundSchema = z.enum(['boxing', 'wrestling', 'bjj', 'kickboxing', 'allround']);
export const CoachTemperamentSchema = z.enum(['calm', 'furious', 'analytical', 'gambler']);

export const CoachSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  background: CoachBackgroundSchema,
  temperament: CoachTemperamentSchema,
  acuity: z.number().min(0).max(100),
});

export const CareerStateSchema = z.object({
  // §16.2. Empty is valid: initialCareerState carries no career to seed.
  seed: z.string(),
  player: FighterSchema.nullable(),
  origin: OriginSchema.nullable(),
  week: z.number().int().min(0),
  energy: z.number(),
  purse: z.number(),
  hype: z.number().min(0).max(100),
  ranking: z.number().int().min(1).nullable(),
  // §16.8. Empty is valid: initialCareerState has no career and so no gym.
  gymId: z.string(),
  // Loop 7.9 (§16.8). Null is valid two ways: initialCareerState has no career,
  // and a career that never moved gyms resolves its anchor from `gymId` alone.
  currentGym: GymSchema.nullable(),
  // Loop 7.9 (§16.8). Null is valid: initialCareerState has no career and so no
  // corner. Rolled at career start and replaced by a gym move.
  coach: CoachSchema.nullable(),
  lifeBars: LifeBarsSchema,
  weightCutProgress: z.number().min(0).max(100),
  fightHistory: z.array(FightSummarySchema),
  retired: z.boolean(),
}) satisfies z.ZodType<CareerState>;

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
  weight: z.number().positive(),
  attributes: AttributesSchema,
});

export const JudgeBiasSchema = z.object({
  strike: z.number(),
  control: z.number(),
  knockdown: z.number(),
  submission: z.number(),
});

export const NamePoolSchema = z.object({
  nationality: z.string(),
  weight: z.number().positive(),
  firstNames: z.array(z.string()).min(1),
  lastNames: z.array(z.string()).min(1),
});

// Loop 7.8 (§16.8): gyms. The four `anchors` are the ids the amateur wrapper
// already emits and its prose already characterises by name — they are authored
// rather than generated so "Ironside MMA" is the same gym the wrapper described.
// Everything else is procedural from the name parts and city list below.
export const GymContentSchema = z.object({
  anchors: z.array(GymSchema).min(1),
  namePartsA: z.array(z.string().min(1)).min(1),
  namePartsB: z.array(z.string().min(1)).min(1),
  cities: z.array(z.object({ city: z.string().min(1), country: z.string().min(1) })).min(1),
});

/** A weighted coach-pool entry whose `id` must be one of the enum's members.
 *  The schema pins the ids rather than accepting free strings so a typo in the
 *  JSON fails at boot rather than silently producing a temperament that no
 *  §16.7 line pool has lines for. */
const CoachTraitPoolSchema = <T extends z.ZodTypeAny>(id: T) =>
  z.array(z.object({ id, label: z.string().min(1), weight: z.number().positive() })).min(1);

export const CoachContentSchema = z.object({
  firstNames: z.array(z.string().min(1)).min(1),
  lastNames: z.array(z.string().min(1)).min(1),
  backgrounds: CoachTraitPoolSchema(CoachBackgroundSchema),
  temperaments: CoachTraitPoolSchema(CoachTemperamentSchema),
});

// Loop 7.6 (§16.5): nickname pools. One entry is a word plus its base weight
// and, optionally, the archetypes and nationalities it leans toward — an entry
// with neither is universal. Leaning is a weight multiplier rather than a
// filter, so a Polish striker can still draw a Brazilian-flavoured word; the
// pools would read as five separate games otherwise.
export const NicknamePartSchema = z.object({
  word: z.string().min(1),
  weight: z.number().positive(),
  archetypes: z.array(z.string()).optional(),
  nationalities: z.array(z.string()).optional(),
});

export const NicknameContentSchema = z.object({
  /** Share of nicknamed fighters that get "{adjective} {noun}" rather than a
   *  standalone. Not the assignment rate — that lives in identity.ts, because
   *  §16.5 states it as a design rule ("roughly 65%"), not a tuning knob. */
  twoPartChance: z.number().min(0).max(1),
  adjectives: z.array(NicknamePartSchema).min(1),
  nouns: z.array(NicknamePartSchema).min(1),
  standalone: z.array(NicknamePartSchema).min(1),
});

// The amateur wrapper's 6 formative moments (DESIGN.md §9.1). statDeltas is
// the only numeric surface — the wrapper UI never renders it, but content
// authoring needs real numbers to enforce budget conservation against.
export const MomentOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  text: z.string(),
  statDeltas: AttributesSchema.partial(),
  weakness: z.string().optional(),
  mentorGymId: z.string().optional(),
});

export const AmateurMomentSchema = z
  .object({
    id: z.string(),
    prompt: z.string(),
    points: z.number().int().positive(),
    options: z.array(MomentOptionSchema).min(2).max(3),
  })
  .superRefine((moment, ctx) => {
    // Budget conservation is structural (§9.1): every option at a moment
    // must sum to the same total — enforced here, not by authoring promise.
    for (const option of moment.options) {
      const total = Object.values(option.statDeltas).reduce((sum: number, v) => sum + (v ?? 0), 0);
      if (total !== moment.points) {
        ctx.addIssue({
          code: 'custom',
          message: `moment '${moment.id}' option '${option.id}' sums to ${total}, expected ${moment.points}`,
          path: ['options'],
        });
      }
    }
  });

export const AmateurContentSchema = z.array(AmateurMomentSchema).length(6);

export type MomentOption = z.infer<typeof MomentOptionSchema>;
export type AmateurMoment = z.infer<typeof AmateurMomentSchema>;

// Life event pool (DESIGN.md §12: ~60 events, templated — §1 pillar 3). Each
// option's effects touch only the channels DESIGN.md §8.3's life-bar table
// actually names: the three life bars, hype, purse (money/sponsors), and
// fighter health (injury/wear). `template` groups the parameterized variants
// that share one event's "shape" — content authoring is required to reuse
// templates (checked below), not hand-author 60 unrelated one-offs.
export const LifeEventEffectsSchema = z.object({
  lifeBars: z
    .object({
      trainingPartners: z.number().optional(),
      partner: z.number().optional(),
      sponsors: z.number().optional(),
    })
    .optional(),
  hype: z.number().optional(),
  purse: z.number().optional(),
  health: z.number().optional(),
});

export const LifeEventOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  text: z.string(),
  effects: LifeEventEffectsSchema,
});

export const LifeEventSchema = z.object({
  id: z.string(),
  template: z.string(),
  prompt: z.string(),
  options: z.array(LifeEventOptionSchema).min(2).max(3),
});

export const LifeEventContentSchema = z
  .array(LifeEventSchema)
  .min(60)
  .superRefine((events, ctx) => {
    // Event ids double as the deck's no-repeat key (career/events.ts) — a
    // duplicate id would let the deck silently skip or collide entries.
    const seen = new Set<string>();
    for (const event of events) {
      if (seen.has(event.id)) {
        ctx.addIssue({ code: 'custom', message: `duplicate life event id '${event.id}'`, path: ['id'] });
      }
      seen.add(event.id);
    }
  });

export type LifeEventOption = z.infer<typeof LifeEventOptionSchema>;
export type LifeEvent = z.infer<typeof LifeEventSchema>;

export const JudgeSchema = z.object({
  id: z.string(),
  name: z.string(),
  bias: JudgeBiasSchema,
  noise: z.number().min(0),
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
  baseStrikeDamage: z.number(),
  dominantRoundThreshold: z.number(),
  roundsPerFight: z.number().int().min(1),
  ticksPerRound: z.number().int().min(1),
  ticksPerCheck: z.number().int().min(1),
  takedownAttemptChance: z.number().min(0).max(1),
  takedownAttemptChanceAggressive: z.number().min(0).max(1),
  submissionAttemptChance: z.number().min(0).max(1),
  knockdownHealthThreshold: z.number(),
  tkoHealthThreshold: z.number(),
  groundDefenseMultiplier: z.number().min(0).max(1),
  // §16.5: subtracted from the defender's pillar value at exactly one contested
  // roll per weakness id. On the same 0-100 scale as the pillars it modifies.
  weaknessPenalty: z.number().min(0),
  significantStrikeChance: z.number().min(0).max(1),
  pressPaceStaminaDrainBonus: z.number().min(0),
  pressPaceStrikingBonus: z.number(),
  protectLeadStrikingPenalty: z.number(),
  protectLeadDefenseBonus: z.number(),
  headhuntPowerMultiplier: z.number().min(0),
  headhuntStrikingPenalty: z.number(),
  maxMomentsPerFight: z.number().int().min(0),
  momentTriggerChance: z.number().min(0).max(1),
  kMoment: z.number(),
  momentSuccessStrikingBonus: z.number(),
  momentFailStrikingPenalty: z.number(),
  momentSkillSwing: z.number().min(0),
  weeklyDecay: z.object({
    partner: z.number(),
    hype: z.number(),
    sponsor: z.number(),
    trainingPartners: z.number(),
  }),
  weeklyEnergyBudget: z.number().min(0),
  trainingGainPerEnergy: z.number().min(0),
  restRegenPerEnergy: z.number().min(0),
  defaultTrainingPartnerQuality: z.number().min(0).max(1),
  // §16.8: a gym's specialty multiplies training gains on the attributes in its
  // group and damps them elsewhere.
  specialtyMultiplier: z.number().min(0),
  offSpecialtyMultiplier: z.number().min(0),
  gymDuesBase: z.number().min(0),
  gymMoveCostBase: z.number().min(0),
  gymMoveOfferChance: z.number().min(0).max(1),
  baseOfferPurse: z.number().min(0),
  offerPursePerRankingPoint: z.number().min(0),
  offerPursePerHype: z.number().min(0),
  baseHypeReward: z.number().min(0),
  purseWinBonus: z.number().min(0),
  hypeGainWin: z.number(),
  hypeLossLoss: z.number(),
  rankingMoveOnWin: z.number().min(0),
  rankingMoveOnLoss: z.number().min(0),
  unrankedEntryRanking: z.number().int().min(1),
  injuryChanceOnWin: z.number().min(0).max(1),
  injuryChanceOnLoss: z.number().min(0).max(1),
  injurySeverityMin: z.number().min(0).max(100),
  injurySeverityMax: z.number().min(0).max(100),
  injuryWeeksMin: z.number().int().min(0),
  injuryWeeksMax: z.number().int().min(0),
  maxCareerFights: z.number().int().min(1),
  retirementHealthFloor: z.number().min(0).max(100),
  lifeGainPerEnergy: z.number().min(0),
  weightCutGainPerEnergy: z.number().min(0),
  cutQualityThreshold: z.number().min(0).max(100),
});
