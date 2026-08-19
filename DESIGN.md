# Project Design Document — MMA Career RPG (working title: *CAGE*)

> **Audience:** developer AI agents working inside an IDE.
> **Status:** design spec, pre-implementation.
> **Read this first.** This document is the single source of truth for architecture, mechanics, and scope. When a decision here conflicts with your instinct, follow this document or raise the conflict explicitly. Do not add features not described here without flagging them as out of scope.

---

## 0. One-paragraph summary

A browser-hosted, single-player MMA career RPG in the spirit of *New Star Soccer*, hosted statically on GitHub Pages. The player creates a fighter through a fast, number-free "amateur wrapper" (character creation disguised as a youth-to-amateur montage), then plays a bounded professional career: manage fight camps, balance a personal life that decays when neglected, cut weight, and fight bouts resolved by a deterministic simulation engine with round-by-round playback and tactical corner decisions. A full career is a 20–40 minute "run." The career ends with a shareable career card. All randomness is seeded and deterministic, enabling a daily challenge and a balance-testing harness. No backend, no accounts, no external art pipeline for v1.

---

## 1. Design pillars (do not violate)

1. **The engine is pure and UI-free.** Fight resolution is a deterministic function of `(fighterA, fighterB, tactics, rng)`. It imports no UI code, touches no DOM, calls no `Math.random`, reads no clock. It returns a full event log; the UI replays that log. This is the most important rule in the document.
2. **A career is a bounded run, not a save-file contract.** Target 20–40 minutes start to finish. Persistence is a convenience. Losing a save must cost the player one session, never one month.
3. **Content is the enemy, not code.** The engine is a week or two of work. Three hundred hand-written life events is six months and will kill the project. Cap content hard (see §12). Prefer procedural generation and templated variety over authored volume.
4. **Determinism everywhere.** One seeded RNG, threaded explicitly. This single rule unlocks the daily challenge, replayable debugging, shareable seeds, and automated balance testing. It cannot be retrofitted; build it in from commit one.
5. **Balance by measurement, not by feel.** A hidden simulation lab (§9) is a v1 deliverable, not a nice-to-have. Without it, wrestlers will win 70% of everything and you will not know until players tell you.
6. **One interactive fight mechanic, reskinned.** Build exactly one player-controlled moment mechanic and reuse it for every moment type. Building three minigames is how this project dies.

---

## 2. Tech stack

Chosen for static hosting, low memory footprint, testability, and good mobile UX. Do not substitute without cause.

| Concern | Choice | Rationale |
|---|---|---|
| Language | **TypeScript** (strict mode) | The engine's correctness depends on types; `strict: true` is mandatory. |
| Build tool | **Vite** | Fast, zero-config static output, trivial GitHub Pages deploy. |
| UI framework | **Preact** (via `preact/compat`) | React's API and ecosystem at ~3KB runtime instead of ~45KB. This is a HUD-driven text UI with no heavy component tree; Preact is the memory-adequate choice and the API is identical for agent purposes. Write React-style code. |
| State | **Zustand** | ~1KB, no boilerplate, no context-provider tax, works outside React for the engine boundary. One store, sliced. |
| Styling | **CSS Modules** + a small design-token CSS file | No runtime CSS-in-JS (memory and bundle cost). Tokens as CSS custom properties. |
| Content | **JSON files** in `/content`, validated by **Zod** schemas at load | Content is data, never code. Zod catches malformed content at boot instead of mid-fight. |
| RNG | **Custom `mulberry32`** (see §5) | ~10 lines, seedable, fast, deterministic. Never a library that reads global state. |
| Persistence | **`localStorage`**, single key, versioned, debounced writes | No IndexedDB — overkill and heavier. Schema-versioned so migrations are possible. |
| Tests | **Vitest** | Same config as Vite; engine gets real unit tests. |
| Deploy | **GitHub Actions → Pages** | See §10. |

**Explicitly not using:** Canvas, WebGL, a game engine (Phaser/PixiJS), Redux, styled-components/emotion, any animation library heavier than CSS transitions. v1 renders text and simple SVG/DOM only.

### Memory-adequacy rules (enforce in review)

- Do not retain full event logs for past fights in memory. Persist a compact fight *summary* (result, method, round, key stat lines); discard the tick-level log after playback completes.
- The RNG produces numbers on demand. Never materialize large random arrays.
- Content JSON is loaded once and treated as immutable/frozen. Do not clone it per fight; pass references and let the engine read.
- One Zustand store. Do not spin up per-screen stores.
- Playback animates via CSS transitions and `requestAnimationFrame` text reveal, not by mounting/unmounting hundreds of nodes. Reuse DOM nodes.

---

## 3. Repository layout

```
/src
  /engine            # PURE. No imports from /ui, /state, or the DOM.
    rng.ts           # mulberry32 + seed helpers
    types.ts         # Fighter, Tactics, FightResult, FightEvent, ...
    fight.ts         # simulateFight(a, b, tactics, rng) => FightResult
    round.ts         # single-round tick resolution
    judging.ts       # scorecards, judge bias vectors
    weightcut.ts     # cut resolution -> per-fight modifiers
    index.ts         # public engine API surface only
  /career            # career-layer logic, still UI-free where possible
    camp.ts          # camp-week energy allocation, training gains
    matchmaking.ts   # opponent generation, offers, ranking ladder
    life.ts          # relationship/hype/money bars, decay
    events.ts        # event deck draw + resolution
    origin.ts        # amateur wrapper -> Origin object; skip-path roll
    progression.ts   # ranking, titles, retirement, career grade
    bout.ts          # M7 §16.2 — owns the fight seed; wraps simulateFight
    gym.ts           # M7 §16.7 — gym/coach generation, camp bias
    identity.ts      # M7 §16.5 — nicknames, style descriptors, tendencies
  /narration         # M7 §16.6. PURE. Reads /engine types + /content only.
    beats.ts         # FightResult -> Beat[] (the 85-event -> ~21-beat fold)
    select.ts        # Beat[] + seeded stream -> NarrationLine[]
    slots.ts         # slot resolution ({A}, {NICK_B}, {GYM_A}, ...)
  /content
    attributes.json
    archetypes.json
    events/*.json
    names/*.json      # nationality-weighted name pools
    names/nicknames.json  # M7 §16.5 — nickname parts
    gyms.json         # M7 §16.7 — authored anchors + procedural name parts
    coaches.json      # M7 §16.7 — coach name parts, backgrounds, temperaments
    narration/*.json  # M7 §16.6 — commentary + corner line pools (lazy chunk)
    judges.json
    balance.json      # ALL tunable constants live here (k, kFinish, decay rates)
  /state
    store.ts          # Zustand store, sliced
    persist.ts        # localStorage load/save/migrate, debounced
    schema.ts         # Zod schemas for content + save
  /ui
    /screens          # ChargenWrapper, RevealScreen, CampScreen, FightScreen, CareerCardScreen, ...
    /components       # HudBar, StatRadar, CornerChoice, PlayByPlay, MomentBar, ...
    /styles           # tokens.css + *.module.css
  /lab
    simulate.ts       # batch runner: N sims across archetype pairings
    report.ts         # win-rate matrix, finish distribution, avg round length
    LabScreen.tsx     # hidden /lab route rendering the report
  main.tsx
  router.ts           # tiny hash router (no react-router needed)
/tests                # Vitest specs, engine-first
```

**Enforcement:** add an ESLint rule or a CI check that fails if anything under `/engine` imports from `/ui`, `/state`, `/career`, or `/narration`, or references `document`, `window`, `Math.random`, or `Date`. `/narration` is subject to the same `Math.random`/`Date`/DOM ban (§16.6): it is pure, it just is not the engine.

---

## 4. Core data model

All numeric attributes are integers on a **0–100** scale.

### 4.1 Attributes (8) and pillars (4)

```ts
interface Attributes {
  power: number;      // striking
  technique: number;  // striking
  speed: number;      // striking
  wrestling: number;  // grappling
  groundControl: number; // grappling
  chin: number;       // durability
  cardio: number;     // durability
  fightIQ: number;    // mind
}

// Pillars are DERIVED, never stored:
// striking   = f(power, technique, speed)
// grappling  = f(wrestling, groundControl)
// durability = f(chin, cardio)
// mind       = fightIQ
```

The engine compares **pillars against pillars**, not overall ratings. A high-grappling fighter can beat a higher-overall striker by refusing to let the fight stay standing. This matchup-over-rating property is a hard requirement — verify it in the lab.

### 4.2 Fighter

```ts
interface Fighter {
  id: string;
  name: string;
  nationality: string;      // drives name pool + flavor only
  weightClass: WeightClass; // single class in v1 (see §12)
  stance: 'orthodox' | 'southpaw';
  attributes: Attributes;
  archetype: ArchetypeId;
  weakness: WeaknessId | null; // the explicitly-named exploitable hole
  traits: TraitId[];           // unlocked by spiking a stat >= 85 (max 2 equipped)
  condition: {
    health: number;   // 0..100 long-term wear, distinct from in-fight health
    injuries: Injury[];
  };
}
```

Traits mirror the "spike a stat to unlock a signature" idea: e.g. `oneShotPower`, `graniteChin`, `cardioMachine`, `submissionWizard`, `takedownMachine`, `ringGeneral`, `blitzStarter`. Each trait is a documented modifier applied inside the engine, gated on the relevant attribute ≥ 85, capped at 2 equipped. Traits reward specialization over spreading points evenly.

### 4.3 Origin object (output of the amateur wrapper)

Intentionally small. Everything else in the amateur phase is disposable flavor text, not state.

```ts
interface Origin {
  statDeltas: Partial<Attributes>; // points allocated per pillar via choices
  archetype: ArchetypeId;
  weakness: WeaknessId | null;
  mentorGymId: string;   // becomes the first training-partner NPC in the life layer
  hypeModifier: number;  // seeds first purse + main-card odds
  amateurRecord: { wins: number; losses: number }; // narrated, never simulated
}
```

### 4.4 Fight result (engine output — the event log)

```ts
interface FightResult {
  seed: string;
  winnerId: string | null;      // null = draw
  method: 'KO' | 'TKO' | 'SUB' | 'UD' | 'SD' | 'MD' | 'DRAW';
  endRound: number;
  scorecards: Scorecard[];      // one per judge
  events: FightEvent[];         // ordered tick-level log for playback
  summary: FightSummary;        // compact, persistable; log is discarded after playback
}

type FightEvent =
  | { t: 'strike'; by: string; kind: string; landed: boolean; damage: number; round: number }
  | { t: 'takedown'; by: string; success: boolean; round: number }
  | { t: 'position'; state: PositionState; round: number }
  | { t: 'knockdown'; who: string; round: number }
  | { t: 'submissionAttempt'; by: string; escaped: boolean; round: number }
  | { t: 'cornerCall'; round: number; tacticId: string }
  | { t: 'playerMoment'; round: number; index: number; kind: MomentKind; outcome: MomentOutcome; played: boolean }
  | { t: 'roundEnd'; round: number; scoreA: number; scoreB: number; staminaA: number; staminaB: number }
  | { t: 'finish'; who: string; method: string; round: number };
```

> **Corrected during the M7 planning pass.** `playerMoment` gained `index`/`played` in Loop 2.4 and `roundEnd` gained `staminaA`/`staminaB` in Loop 2.2; this block had drifted from `engine/types.ts`. The code was right and the document was stale — the union above now matches the implementation. **Which variants can actually be emitted is a narrower question than which the type permits**, and narration depends on the answer: see §16.6's reachability manifest.

---

## 5. RNG (build this first, before anything else)

```ts
// engine/rng.ts
export interface RNG { next(): number; } // returns [0,1)

export function mulberry32(seedInt: number): RNG {
  let a = seedInt >>> 0;
  return {
    next() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

// Hash a string seed (e.g. "2026-08-12" or a share code) to a 32-bit int.
export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
```

**Rules:**
- The engine receives an `RNG` instance. It never creates its own and never calls `Math.random`.
- Thread the same instance through every roll in a fight so a `(seed, fighters, tactics)` triple always reproduces the identical `FightResult`.
- The daily challenge seeds from the date string. Share codes are seed strings.
- Provide a helper `rollLogistic(a, b, k, rng)` implementing the core probability (see §6).

---

## 6. Fight engine (the heart)

`simulateFight(a, b, tactics, rng): FightResult`. Rounds resolve as a series of ticks, reported to the player as one explicit **check** per in-fiction minute — see §6.6a. Two persistent pools per fighter: **health** and **stamina**, both drain, both feed back into effectiveness.

### 6.1 Core probability — the one dial that defines the whole game

```ts
// Probability that A wins a contested action against B, given attribute values.
function rollLogistic(A: number, B: number, k: number, rng: RNG): boolean {
  const p = 1 / (1 + Math.exp(-(A - B) / k));
  return rng.next() < p;
}
```

`k` lives in `balance.json`. Start at `k = 12`–`15` on the 0–100 scale. At `k=12`, a 20-point edge wins ~81% of the time. **Lower `k` = deterministic and boring; higher `k` = stats stop mattering.** This single constant is the difficulty-and-randomness philosophy of the entire game. Tune it against lab data, never by vibe.

### 6.2 Position

Each tick, whichever fighter intends to change position (per their tactic and archetype) rolls `rollLogistic` on the relevant pillar delta (wrestling vs takedown defense to secure a takedown, etc.). Position gates which actions are available and their damage/scoring weights.

### 6.3 Stamina feedback (worth more than ten extra attributes)

- Stamina drain per action scales **inversely with cardio**.
- Current stamina multiplies **accuracy, takedown defense, and effective chin**.
- This single loop generates every dramatic arc the sport has: the fast starter who fades, the round-three grinder, the gas-tank upset. Implement it before adding any attribute.

### 6.4 Damage and finishes (do NOT roll for KO directly)

Roll per *landed significant strike* against an **effective chin** that already folds in accumulated damage, current stamina, and the weight-cut penalty:

```ts
const effectiveChin = chin
  * (health / maxHealth)
  * staminaFactor        // derived from current stamina
  * cutPenalty;          // from weightcut.ts, <= 1

const pKO = 1 / (1 + Math.exp(-(power - effectiveChin) / kFinish));
```

This yields the sport's real shape — a fighter absorbs punishment, then folds suddenly — with no special-case scripting. **Submissions use the same form** on the grappling delta, gated on dominant position and scaled by the opponent's remaining stamina. `kFinish` is its own constant in `balance.json`.

### 6.5 Judging

Score each round from strike differential, control time, knockdowns, and threatened submissions. Then give each of **three judges an independent bias vector and a noise term**. Split decisions, robberies, and controversy emerge for free. Named judges with visible tendencies (a grappling-blind judge, a volume-over-damage judge) cost ~20 lines and buy enormous texture — put them in `judges.json`.

### 6.6 Fight IQ is information, not a flat bonus

- High IQ **reveals the opponent's tendencies** pre-fight and makes the corner's advice **accurate**.
- Low IQ makes the corner **sometimes wrong** (suggests a tactic mismatched to the situation).
- Implement IQ as the fidelity of information surfaced to the player, not as a hidden `+X` on rolls.

### 6.6a Per-minute checks (amendment — resolution cadence, not a new system)

Round resolution is not a silent continuous loop. Each round is an explicit sequence of **checks**, one per in-fiction minute (a 5-minute round is 5 checks; a 3-round amateur bout is 15 checks total). A check is the player-visible unit of "something happened this minute" — pressing "fight" must read as watching a contest unfold, not as one engine roll producing a result.

- **A check wraps the existing finer tick loop, it does not replace it.** §6.2–§6.4's per-tick stamina drain, strike/position `rollLogistic` calls, and finish rolls keep running at their existing (finer than one-minute) rate — that granularity is what gives stamina curves and damage accumulation their shape. A check is the *aggregation and report* of one minute's worth of those ticks: it resolves to a single contested winner/margin for that minute-slice (via the same pillar-vs-pillar `rollLogistic` form, §6.1, applied to the minute's dominant exchange — striking or position/grappling) and that is the unit the player sees land.
- **Checks feed the existing `RoundTape` directly — no parallel scoring system.** A check's outcome increments the same fields §6.5/`judging.ts` already reads: a striking check win adds to `strikesLanded`, a position/grappling check win adds `controlTime` or a takedown count, a knockdown or submission threat surfaces the same way it does today. Judges' bias vectors and noise (§6.5) are computed from this tape exactly as before — per-minute checks are a coarser, player-legible *sampling* of the same tape, not a bypass of it. There is no separate "checks won" tally competing with the scorecard; the fighter who wins more checks and the fighter the judges score higher should normally agree, precisely because they're reading the same numbers.
- **Each check is one `Beat`** for §16.6's narration pipeline — see the amendment there.
- **Corner decisions are unchanged.** §6.7's between-round tactical choices still land only at round boundaries; checks are the resolution *within* a round, not a new place for player input.

### 6.7 Corner decisions and player moments

- **Between rounds**, the corner offers 2–3 tactical choices with real trade-offs: press the pace (stamina cost), shoot for takedowns, protect a lead, headhunt for the finish. Each maps to tactic parameters the next round reads.
- **1–3 times per fight**, the sim yields control to the player for a discrete **moment** (a scramble, a submission escape, a finishing sequence). See §7.

---

## 7. The interactive mechanics

Build a small, tightly scoped set of interactive mechanics — currently two: a **timing bar** and a **push-your-luck risk ladder** — reskinned per `MomentKind` through one shared component. Any additional mechanic beyond these two requires updating this section explicitly; the cap on *count* is what's load-bearing, not the number two itself.

- Same component (`MomentBar`), different labels/stakes per `MomentKind`; the timing bar suits single explosive instants (scramble, finishing sequence), the risk ladder suits moments the fighter can grind through or bail out of (submission escape).
- Its outcome feeds back into the engine as a bounded performance tilt (`-1..+1`) on the moment's contested delta, not as an instant win/loss (except an explicit finishing-sequence moment, which can end the fight).
- The moment must be *fair to skip*: an "auto-resolve" option resolves it via the engine so the game is fully playable without twitch input (accessibility + it keeps the sim authoritative). Performance 0 (the auto-resolve value) is exactly the engine's own unaided roll.

---

## 8. Career layer

### 8.1 The loop

`Camp weeks → Fight night → Aftermath → (repeat) → Retirement`

- **Camp weeks:** the player spends a scarce **energy** budget across training (attribute gains, gated by training-partner quality), weight management (feeds the cut), rest (regen), and life (see §8.3). NSS's scarcity principle: the player is permanently short of something.
- **Fight night:** the engine runs; the UI plays it back.
- **Aftermath:** purse paid, hype adjusts, ranking updates, injuries applied, sponsor offers refreshed.

### 8.2 Weight cut (a first-class system, not a checkbox)

- Weight class is a strategic commitment (drop a class for a ranking edge; move up to escape a bad matchup).
- Diet and hydration are a **camp-long resource** the player manages across weeks.
- The cut **resolves on fight week** into `cutPenalty` (and cardio/power modifiers) for that fight only. A clean cut is earned over the camp; a botched cut debuffs chin, power, and cardio.

### 8.3 Life bars (NSS translation) — decay when neglected

| System | Neglect penalty |
|---|---|
| Training partners | camp gains lose their multiplier |
| Partner (personal) | energy regen drops, focus penalty in camp |
| Hype / fans | smaller purse, no sponsor offers, no main-card slots |
| Sponsors | money dries up, gym dues unpaid |
| Injury / wear | attribute decay, forced withdrawals |

Every bar decays each week if unfed, keeping the player short of energy — the engine of NSS-style tension.

### 8.4 Matchmaking and ranking

- Single weight class in v1. A ranking ladder from ~#15 to the title.
- Opponents are **procedurally generated** from nationality-weighted name pools + archetype templates. Do not hand-author a roster. This is cheaper, more replayable, and sidesteps likeness issues.
- The matchmaker offers bouts whose quality scales with hype and ranking; poor life management yields worse offers.

### 8.5 Retirement — the shareable artifact

End every career with a **career card**: record, finishes, title reigns, the rival you never beat, an archetype label, three highlight fight-moments, and a grade. Output as **shareable text (Wordle-style)** — zero backend, free retention. This is a v1 deliverable, not a stretch goal.

---

## 9. The amateur wrapper (character creation)

### 9.1 Behavior

- **6 formative moments**, each with 2–3 options.
- **Budget conservation is structural:** every option at a given moment grants the *same total* points, distributed differently across pillars. "Wrestling club" and "boxing gym" both grant e.g. 12 points, weighted differently. No option is strictly better; every choice is a real trade-off (specialist vs all-rounder).
- **Number-free during the montage.** Show effects in fiction, never live stat deltas. Displaying numbers turns it back into a form wearing a costume.
- **Amateur record is narrated, never simulated.** Derive outcomes from the archetype being built ("your regional bouts go 3–1; the loss to a wrestler exposes your takedown defense"). Outputs: a hype modifier and possibly a second flag on the weakness field. Do **not** invoke the fight engine here.

### 9.2 The reveal screen (the payoff)

Immediately after the montage: **radar chart, overall rating, archetype name, and the explicitly-called-out exploitable weakness.** This is the dopamine payoff for six choices that felt like backstory.

### 9.3 Skip path (confirmed)

- A second-playthrough option **auto-rolls the Origin object** (seeded) and jumps straight to a randomized pro debut — a harder/faster variant (cf. 7a0's blind "Almanaque" mode).
- Because the wrapper already outputs a self-contained `Origin`, the skip path is nearly free: generate a valid `Origin` from the RNG and hand it to the same pro-debut entry point.

### 9.4 Tutorial placement

- The wrapper teaches **vocabulary and fiction only** (weight class, gym, corner) — no mechanics.
- The **systems tutorial** (camp-week energy allocation, the first weight cut) lives inside **pro fight camp #1**, where it is load-bearing rather than a demo. Never stack two tutorials back to back.

---

## 10. The balance lab (v1 deliverable)

Hidden `/lab` route.

- `simulate.ts`: run **N** simulations (default 10,000) across all archetype pairings, fully seeded.
- `report.ts` outputs: **win-rate matrix** (archetype × archetype), **finish-rate distribution** (KO/SUB/decision split), **average round length**, and stamina-fade curves.
- Acceptance gates before shipping any balance change:
  - No archetype wins >~60% against the field average.
  - The matchup-over-rating property holds (a specialist beats a higher-overall generalist in its favorable matchup at a measurable, non-trivial rate).
  - Finish rates land in a believable band (tune to taste, document the target).
- Every tunable constant lives in `balance.json`; the lab reads the same file the game does. Balancing is editing JSON and re-running the lab, never editing engine code.

---

## 11. Persistence and routing

- **Router:** a ~20-line hash router (`#/chargen`, `#/camp`, `#/fight`, `#/card`, `#/lab`). No react-router.
- **Save:** single versioned `localStorage` key, debounced writes, Zod-validated on load. On schema mismatch, attempt migration; on failure, offer a clean restart (never crash). Saving is convenience — the game must be fully enjoyable in one sitting without it.
- **Daily challenge:** seed = today's date string; everyone gets the same prospect + event deck; result is a shareable code/text.

---

## 12. Scope and milestones (cap content HARD)

Ship in this order. Each milestone is independently demoable.

1. **M1 — Engine + Lab.** `simulateFight` + RNG + judging + weight-cut modifier. No career UI. Fighters from a JSON fixture. `/lab` renders the balance report. *Definition of done: the matchup-over-rating property is provable in the lab.*
2. **M2 — Fight viewer.** Round-by-round playback of the event log, corner decisions, the one player-moment mechanic, scorecards.
3. **M3 — Career shell.** Camp weeks + energy allocation, matchmaking, ranking ladder, aftermath, retirement career card. Origin object supplied by a stub.
4. **M4 — Life layer + wrapper.** Relationship/hype/money/injury bars with decay, weight-cut camp management, the amateur wrapper + reveal screen + skip path, first event pool of **~60** events.
5. **M5 — Daily prospect.** Seeded daily run + shareable result.

M1–M5 closed the v1 feature set (§14). Two further milestones are specified against the sections that were written after them, and are listed here so this section stops drifting: **M6 — Visual system** (§15) and **M7 — Identity and voice** / **M8 — Front of house** (§16). §16 explains why M7's scope splits across two gates instead of one.

**Hard content caps for v1:**
- **One** weight class.
- **~20–30** opponents, all procedurally generated (no hand-authored roster).
- **~60** life events, templated for variety.
- If a milestone slips, cut content, never determinism or the lab.

---

## 13. Legal / naming guardrails

- **No UFC.** Avoid the trademark entirely.
- **"Octagon" is separately trademarked** (Zuffa) — name the cage something else (e.g. "the ring", "the cage", a fictional branded arena).
- Use a **fictional promotion** with its own president/matchmaker archetype (also better comedy than a real-org clone).
- Procedurally generated fighters sidestep likeness issues. Do not model real athletes.

---

## 14. Definition of done (v1)

- A player can create a fighter via the wrapper (or skip), fight a full bounded career in 20–40 minutes, and retire with a shareable card.
- The engine is pure, deterministic, unit-tested, and passes the lab's balance gates.
- The whole thing loads and runs smoothly on a mid-range phone, deployed to GitHub Pages with no backend.
- Losing the save costs at most one session.

---

## 15. Visual system

> Added after M5. Until this section existed the app shipped a 90-byte stylesheet and every screen inlined its own `style={{}}` object — the "CSS Modules + design tokens" line in §2 was specified and never executed. This section is what §2 meant. It is binding: a screen that does not draw from these tokens is not done.

### 15.1 Two registers, one spine

The game has two modes with opposite emotional registers, and they get different visual treatments:

| | **The File** | **The Broadcast** |
|---|---|---|
| Screens | Career hub, camp, chargen, reveal, career card | Fight night, corner decisions, moments |
| World | Athletic-commission paperwork: licenses, weigh-in logs, medical suspensions, filed camp schedules | Fight-night television: lower-thirds, tale of the tape, scorecards, corner assignment |
| Surface | A light document on a dark desk | Lit figures on arena black |
| Voice | Deliberate, administrative, past tense | Immediate, present tense, loud |
| Player is | Filling out a form | Being hit |

**This split is the design, not an inconsistency.** Planning and violence should not feel alike; the whole loop is the tension between the two. The registers share a spine — one type scale, one spacing scale, one geometry, one motion grammar — and diverge only in palette, surface, and density. The walkout set piece (§15.7) exists to sell the boundary between them, which makes it the most dramatic moment in the run.

Do not introduce a third register. Do not blend the two on one screen. The reveal screen is The File (it is a filed license, and it belongs to the chargen flow); everything downstream of the walkout until the aftermath is The Broadcast.

### 15.2 Tokens

All tokens live in `ui/styles/tokens.css` as custom properties. Register selection is a class on the screen root (`.reg-file` / `.reg-broadcast`), never a media query and never per-component.

**The File**

```css
--desk:         #131210;  /* the surface the document rests on */
--paper:        #E6E1D3;  /* NCR white stock, aged */
--paper-carbon: #D8CFA9;  /* the goldenrod second sheet */
--paper-pink:   #DCC3BC;  /* the pink third sheet — medical/suspension only */
--ink:          #1B1916;  /* typewriter black */
--ink-soft:     #575145;  /* faded carbon — secondary text */
--rule:         #AFA792;  /* form rules and field underlines */
--stamp:        #B4342A;  /* rubber-stamp vermilion */
--stamp-blue:   #2C4A78;  /* commission blue ink */
```

Not cream. `--paper` is deliberately grayer and cooler than the warm-cream default; the carbon and pink sheets are the real triplicate NCR colors and are what keep this from reading as generic stationery.

Measured contrast on `--paper`: `--ink` 13.43:1 (AAA), `--ink-soft` 6.02:1 (AA), `--stamp-blue` 6.82:1 (AA), `--stamp` 4.64:1 (AA). `--ink` on `--paper-carbon` is 11.21:1. All pass AA at body size; `--stamp` has the least headroom, so keep it for stamps, rules, and marks rather than long text.

**The Broadcast**

```css
--canvas:          #0B0B0D;  /* arena black */
--canvas-lit:      #17171B;  /* raised surfaces, meter troughs */
--bone:            #F1EFE9;  /* broadcast white */
--bone-soft:       #9A968D;  /* secondary */
--grid:            #26262C;  /* hairlines */
--red-corner:      #D2382C;  /* fills and marks — the player, always */
--blue-corner:     #3477BE;  /* fills and marks — the opponent, always */
--red-corner-text: #F0655A;  /* the same identity, legible as small text */
--blue-corner-text:#6BA6E8;
--amber:           #E5A63C;  /* rocked, gassed, injured */
```

**Corner colors are functional, not decorative.** Red and blue corner assignment is real MMA vocabulary. The player is always red; every opponent is always blue. Every meter, scorecard cell, radar polygon, play-by-play line, and stat inherits its corner color, so the player never reads a label to know whose number they are looking at.

Measured contrast on `--canvas`: `--bone` 17.10:1 (AAA), `--bone-soft` 6.67:1 (AA), `--amber` 9.22:1 (AAA).

`--red-corner` and `--blue-corner` measure 4.07:1 and 4.24:1 — **fills only**, they fail AA for body text. Any corner-colored text below 18.66px bold must use the `-text` variants, which measure 6.29:1 and 7.72:1. This rule is the single largest cause of the unreadable text this section exists to fix; enforce it in review.

**Spine (both registers)**

```css
--sp-1: 4px;  --sp-2: 8px;   --sp-3: 12px;  --sp-4: 16px;
--sp-5: 24px; --sp-6: 32px;  --sp-7: 48px;  --sp-8: 64px;

--t-1: 12px; --t-2: 14px; --t-3: 16px; --t-4: 21px;
--t-5: 27px; --t-6: 35px; --t-7: 46px; --t-8: 60px;

--radius-surface: 0;    /* sheets, plates, scene backdrops */
--radius-control: 2px;  /* buttons, inputs, chips */

--dur-fast: 120ms; --dur-base: 200ms; --dur-slow: 420ms;
--ease: cubic-bezier(0.2, 0, 0, 1);
```

Surfaces are square because both commission forms and broadcast lower-thirds are square. Controls carry 2px so they read as touchable. That 2px is a decision — do not round it up to "soft" radii.

### 15.3 Type

Three files, self-hosted, subsetted, committed to the repo. No build-time font pipeline, no CDN, no `@import` from Google Fonts (a network dependency on a static, offline-capable game is a defect).

| Role | Face | File | Budget |
|---|---|---|---|
| Body, labels, buttons, prose | **Archivo** variable, wght 400–700 | `archivo-var.woff2` | ~24KB |
| Display — names, round numbers, VS, verdicts | **Archivo Condensed** 700 static | `archivo-cond-700.woff2` | ~13KB |
| All data — scorecards, logs, purses, weights, form values | **IBM Plex Mono** 400 static | `plex-mono-400.woff2` | ~14KB |

Both families are OFL. Archivo is a sturdy American grotesque that reads correctly as both a government form and a sports graphic, which is exactly the two-register problem; using one family across both roles via width and weight is what keeps the spine shared. IBM Plex Mono was drawn for an institutional voice and carries the commission register without looking like a code editor.

Rules:

- **Every number in the game is mono and tabular.** Purses, weights, hype, rankings, scorecards, round times, allocation values. Numbers that shift horizontally as they change are the second-largest readability failure in the current build.
- Body prose never goes below `--t-2` (14px). The current build renders life-event text and slider hints at 11–12px on a dark background.
- Display face is uppercase-only and always tracked out (`letter-spacing: 0.02em`); Archivo Condensed at tight tracking closes up badly at large sizes.
- Document the exact `pyftsubset` invocation in `ui/styles/fonts/README.md` so the subsets are reproducible. Commit the `.woff2` files.
- `font-display: swap`, and the fallback stack must be metric-adjusted (`size-adjust`) so the swap does not reflow the layout.

### 15.4 Portraits — the signature element

**A fighter's face is their record.** Portraits are procedural vector drawings that accumulate the damage the career actually did: cauliflower ear, brow scar tissue, a nose that drifts off center, swelling that fades between camps. The retirement card puts the debut face beside the retirement face. Nothing else in the game is as memorable, and it is derived entirely from state already tracked.

**FaceCode.** Nine feature slots, each an index below 36, serialized to a nine-character base36 string:

```ts
interface FaceCode {
  skin: number; head: number; hair: number; hairColor: number;
  brow: number; eyes: number; nose: number; mouth: number; facialHair: number;
}
// serialized: "3a71b02c5"
```

Stored on `Fighter` as `face: string`, alongside `nationality` and `stance` — the existing precedent for pure-flavor fields the engine never reads (§4.2). The engine must not read `face`; the purity check in Appendix B still applies.

- **Opponents** get a face from `faceFromSeed(rng)` at generation time, drawn from the same seeded stream as their name and attributes. A given seed always produces the same opponent with the same face, which extends the determinism contract to what the player sees.
- **The player** authors their own in the amateur wrapper, as step 0 ("who's in the mirror") before the six moments. This does not violate §9.1's no-numbers rule — a portrait editor shows no statline. The reveal screen then shows the finished face beside the radar.
- **Wear is derived, never stored.** `faceWear(fighter, record, fightHistory) => WearLayers` is a pure function over `condition.injuries`, the record, and fight summaries. If a wear signal is not present in `FightSummary`, add it to the summary — do not persist a wear object, and do not let wear drift out of sync with the career it describes.

**Rendering is `<symbol>` + `<use>`.** One hidden `<svg>` defs block mounts once at app root holding every feature path; each `<Portrait>` is ~9 `<use>` elements referencing shared geometry. This is §2's "reuse DOM nodes" rule applied to art: a slate of six opponents costs six times nine `<use>` nodes, not six times nine path definitions.

**Zero raster assets.** A 512px PNG costs ~1MB of decoded RAM regardless of its file size; a procedural roster cannot be pre-illustrated anyway. CI enforces that no `.png`/`.jpg`/`.webp` ships outside the favicon.

### 15.5 Flags

`Fighter.nationality` is a free string with five real values (`Brazil`, `Ireland`, `Japan`, `Poland`, `USA`) plus the `lab` and `fixture` sentinels. Flags render from an inline SVG sprite in the same defs block as the face symbols, keyed by nationality with an explicit neutral fallback for the sentinels — never a broken or missing glyph.

**Do not use emoji flags.** Windows does not render regional-indicator sequences; `🇧🇷` displays as the letters "BR" on the primary development target. Inline SVG is ~1.2KB for all five and renders identically everywhere. Simplify the geometry for legibility at 16px (Brazil keeps the green field, yellow lozenge, and blue disc; it does not get 27 stars).

### 15.6 Scene plates

Six flat geometric SVG plates — `gym`, `weigh-in`, `tunnel`, `cage`, `medical`, `home` — roughly 1KB each, drawn once and rendered in two treatments: duotone halftone on paper in The File, lit silhouette on black in The Broadcast. Same geometry, two CSS treatments, one asset. Used as low-opacity full-bleed backdrops behind key screens, never behind dense data.

### 15.7 Motion

Functional motion everywhere, one orchestrated set piece. Every rule below is disabled under `prefers-reduced-motion: reduce`, which must cut to the end state rather than slowing it down.

**Functional (CSS only):** meters ease to new values, numbers count up on aftermath, screens cross-fade at `--dur-base`, buttons carry press and visible focus states, the resolved camp sheet slides away to reveal the carbon copy beneath it (the next week's blank form).

**The set piece — the walkout.** It fires at the register boundary, once per fight, and is skippable by any input:

1. The file curls away, tunnel plate behind it
2. Red corner enters from the left
3. Blue corner enters from the right
4. VS strikes through the center
5. Tale of the tape ticks in row by row
6. Bell — the HUD takes over

~2.5s total. This is the only choreographed sequence in the game. Spend the boldness here and keep everything else quiet.

### 15.8 Component vocabulary

Build these as CSS Modules under `ui/components/`. Screens compose them and own no inline styles.

`Sheet` · `Plate` · `Button` · `Meter` · `BudgetSplit` · `FormRow` · `Stamp` · `FlagChip` · `Portrait` · `FighterIdentity` · `TaleOfTheTape` · `Scorecard` · `ScenePlate`

Existing components are retheme targets, not rewrites: `HudBar` becomes `Meter`, and `StatRadar`, `PlayByPlay`, `MomentBar`, and `CornerChoice` take register-aware tokens.

**`BudgetSplit` replaces the camp screen's four sliders.** Today the core scarcity loop renders as four independent range inputs plus a text warning, which hides the one thing that matters: it is a zero-sum split of ten energy. `BudgetSplit` is a single bar divided into four labeled segments with draggable dividers, always summing to exactly the budget, with unspent energy shown as a hatched tail.

This removes the ability to over-allocate. That costs nothing: `clampAllocation` scales every pillar proportionally, so requesting (20, 20, 0, 0) against a budget of 10 resolves to exactly (5, 5, 0, 0) — identical to requesting (5, 5, 0, 0) directly. Over-allocation is mechanically a no-op and the warning is pure noise. Keep `clampAllocation` as an engine-side guard; delete the over-budget state from the UI.

### 15.9 Budgets (enforce in CI)

| Budget | Ceiling |
|---|---|
| CSS | 28KB raw / 7KB gzip |
| Fonts | 60KB total woff2 |
| Inline SVG (faces + flags + plates) | 14KB |
| JS delta, per milestone (M6: 22.88KB, settled; M7: ≤25KB since M6) | see below |
| Total transfer, gzipped | 150KB |
| Raster assets | zero, favicon excepted |
| DOM nodes on the busiest screen | 1200 |

**Amended at Loop 6.12 (M6's exit gate): the JS line was 20KB raw and is now 24KB.** The original figure was a forecast written before any of §15 existed. Measured from real builds at both ends — commit `1e07e97` (M5 done) emits a 179,840-byte entry chunk; M6 closes at 203,232 — the revamp cost **22.84KB raw / ~8.6KB gzip**, and bought: the token system and `Screen` primitive (6.1), thirteen kit components (6.2), flags and `FighterIdentity` (6.3), procedural portraits and `FaceCode` (6.4), the portrait editor (6.5), wear derivation (6.6), five rebuilt screens (6.7, 6.8, 6.11), six scene plates (6.9), and the walkout (6.10).

Two developer routes were moved out of the initial chunk first rather than counted against it: `#/lab` (§10, a developer deliverable) and `#/kit` (Loop 6.2's verification surface) are dynamic imports, together 8.7KB no player path downloads. The remaining 3KB could only be recovered by lazily loading character creation as well, which puts a loading state on the first thing every new career does — a worse game in exchange for a rounder number.

The budget that actually protects the player is total transfer, and it closes M6 at **108.67KB gzip against 150KB**. That is the line to defend in M7, where §16.9 shows the headroom falling to single-digit KB.

**Re-baselined at Loop 7.1.** The JS line above measured what the revamp cost, and the revamp is finished — measured against the M5 baseline it would charge every future loop for work that already shipped, and the career seed plus the session wiring alone spent all but 70 bytes of it. M6's cost is settled at **22.88KB raw** (M5 179,840 → M6 203,271, both measured) and is now reported rather than enforced. The live ceiling re-baselines at the M6 close and takes §16.9's own figure for M7's JS: **25KB raw since M6**. §16.9's two replacement checks — initial transfer ≤ 150KB gzip and narration chunk ≤ 13KB gzip — are both in `scripts/check-budgets.mjs`; the narration one activates when Loop 7.10 creates the chunk.

Every line in this table except inline SVG is enforced by `scripts/check-budgets.mjs`, run in CI against a real build. Inline SVG is enforced at source in `tests/sprite.spec.ts`, because once minified into the bundle it is indistinguishable from the components around it. The Playwright driver at `.claude/skills/run-cage/driver.mjs` walks the full flow and screenshots each checkpoint, and since Loop 6.12 also asserts the node ceiling, captures at three viewports, and runs an axe pass on every screen. Visual loops verify by screenshot — that is what the harness is for.

---

## 16. Identity, narration, and the shape of a run

> **Added after M6 was specified but before it was implemented.** §15 makes the game *look* like a game. This section makes it *read* like a career: who the two people in the cage are, what it sounds like when they fight, and where the player is standing when they are not fighting. It is binding in the same way §15 is — a screen or a line pool that does not conform to it is not done.
>
> It composes with §15, it does not layer on top of it. Every screen named here roots in `Screen`, carries exactly one of the two register classes, and draws only from §15.2's tokens and §15.8's component vocabulary. Four components are added to that vocabulary in §16.3; nothing else may be invented screen-side.

### 16.1 What was measured, and what it invalidates

The M7 planning pass ran 400 seeded bouts through the shipped engine and counted what actually comes out. Three results are load-bearing enough that the rest of this section is built on them.

| Measured | Value | Consequence |
|---|---|---|
| Events per bout | avg **84.9**, p50 89, p90 133, max 151 | A line per event is unreadable and unaffordable. Narration is a *selection* layer, not a translation layer (§16.6). |
| Share of the log that is one landed strike | **83%** (61.5 standing + 9.5 ground per bout) | Line volume must be allocated by measured frequency, not spread evenly across the event union. |
| Strike damage | p50 **0.13**; health never fell below **85.9** | §6.4's damage-accumulation curve is not running. `knockdown` fired **0 times in 400 bouts**; `finish: TKO` fired **0 times**. See below. |

**The damage finding is a defect, not a design choice.** §6.4 specifies that a fighter "absorbs punishment, then folds suddenly," with `effectiveChin` folding in accumulated damage. With `baseStrikeDamage: 0.3`, a bout inflicts roughly 8 points of health across ~30 landed strikes per side. `knockdownHealthThreshold: 55` and `tkoHealthThreshold: 35` are therefore unreachable, `health <= 0` is unreachable, and every one of the 208 knockouts observed came from the flat 1.6%-per-significant-strike finish roll against a chin that never meaningfully degraded. The health bar in the HUD is decorative, portrait wear (§15.4) has almost no signal to read, and the loudest beat in combat sports — a fighter getting hurt — has no event to fire on.

This is a `balance.json` problem, not an engine problem, and it is fixed the way §10 says balance is always fixed: edit the JSON, re-run the lab, re-check the acceptance gates. It is a **prerequisite** for §16.6, not an optional cleanup, because narration with no `knockdown` beat is narration of a spreadsheet.

**Reachability is narrower than the type.** Of the variants `FightEvent` permits, the engine can currently emit only these:

```
strike:strike:landed=true        takedown:success=true     position:topControl
strike:groundStrike:landed=true  takedown:success=false    position:standing
knockdown            (unreachable until the damage re-tune)
submissionAttempt:escaped=true|false
cornerCall           (only rounds > 1, only when a plan entry exists)
playerMoment:{scramble|submissionEscape|finishingSequence}:{success|fail}:{played|auto}
roundEnd
finish:{KO|SUB}      (TKO unreachable until the damage re-tune)
```

`landed: false`, `position: 'clinch'`, and `position: 'bottomControl'` are **unreachable by construction** — no code path emits them. A coverage test that walks the type union and demands lines for them would be demanding content for events that can never fire. §16.6 specifies a reachability manifest instead, checked in both directions.

**A decision has no terminal event.** 32% of bouts go the distance (UD 65, SD 45, MD 13, DRAW 5 of 400) and end with a `roundEnd`, with the verdict living only on `FightResult.method`. Narration therefore reads the `FightResult`, not just `events[]`, and synthesises two beats the log does not contain: `open` and `decision`.

### 16.2 The career seed, session state, and persistence

**A career has a seed and it is saved.** `CareerState` gains `seed: string`. Every career-layer draw derives a stream from it rather than from the clock:

```ts
careerRng(seed, purpose, index) => mulberry32(seedFromString(`${seed}:${purpose}:${index}`))
// purposes: 'gym' | 'coach' | 'opponent' | 'bout' | 'narration' | 'event' | 'injury'
```

This replaces the three `Date.now()` call sites in `CareerScreen`, which make a career's fights unreproducible and reduce the M5 daily run to a shared *origin* with private fights. Daily runs set `seed` to the date string; normal runs set it to a random string generated once at career start and shown on the career card. **Determinism now covers a whole run, not just one bout** — which is what makes a shared daily result comparable and what makes §16.6's narration replayable.

**`FightSummary.seed` is currently always the empty string.** `simulateFight` receives an `RNG` instance and cannot know the seed that produced it, so it writes `seed: ''` and every persisted summary carries a lie. The engine is right not to know; the fix belongs one layer up. `career/bout.ts` owns bout seeding:

```ts
runBout(career, opponent, tactics, overrides) => { result: FightResult; seed: string }
// seed = `${career.seed}:bout:${career.fightHistory.length}`
```

and stamps the seed into the summary before it is persisted.

**Session state vs saved state.** The route is session state and is never persisted. The bout is saved, but only as its inputs:

| Persisted | Not persisted |
|---|---|
| `seed`, career fields, `gymId`, `coach`, `fightHistory` (summaries + ledger, §16.5) | The route/hash |
| The active bout's `{ opponent, seed, tactics, momentOverrides, roundsRevealed }` (~200 bytes) | `FightResult.events[]` — §2's rule stands |
| The authored `FaceCode` | Any `WearLayers`, any narration line, any beat |

Persisting a bout's *inputs* rather than its output is what lets a mid-fight reload resume: the app re-simulates from the seed and resumes at the last completed round. Resume granularity is the round, not the tick, because corner calls are round-keyed. Determinism is doing work a save file normally could not.

**`loadCareer` must report why it returned nothing.** Its current signature cannot distinguish "no save" from "a save existed and was discarded," so the title screen cannot tell the player their save was dropped. It becomes:

```ts
loadCareer(storage) => { career: CareerState; status: 'empty' | 'loaded' | 'discarded' }
```

`'discarded'` covers malformed JSON, a failed schema parse, and an unknown version. The never-throws contract and the clean-restart fallback are unchanged and still verified by `tests/persist.spec.ts`.

**`SAVE_VERSION` goes to 3.** M6 takes it to 2 for the face code. M7 adds `seed`, `gymId`, `coach`, and ledger fields, moves the record onto `Fighter` (§16.5), and removes `CareerState.record` — a version-2 save is not migratable into that shape by any rule worth writing. `persist.ts` already rejects an unknown version and returns the initial state without throwing (verified), and §14 accepts that losing a save costs one session. Bump, do not migrate.

*Discarded: riding M6's bump to 2.* It is only safe if M6 never reaches a player before M7 lands, which is a deployment assumption rather than a code fact.

### 16.3 Screen inventory and routing

**The route is derived, never trusted.** A single pure function is the whole navigation model:

```ts
resolveRoute(career: CareerState, requested: string): string
```

It returns the requested route if that route is legal for the career state, and the nearest legal ancestor otherwise. Reload, deep link, typo, and stale bookmark all go through it, so "what happens on reload mid-screen" has one answer for every screen instead of seventeen. An unknown route resolves to the title rather than silently rendering the hub, which is what happens today.

**Today, five of seven screens have no way out.** `CampScreen`, `CareerCardScreen`, `FightScreen`, `RevealScreen`, and `LabScreen` render no navigation of any kind — the only exits are the browser back button and the URL bar. This is why the Playwright driver navigates by `page.goto` instead of by clicking. Every screen below has a named back path; that is a hard requirement of this section, not a nicety.

| # | Screen | Route | Register | Entry | Exit / back | Empty state | Error state | On reload |
|---|---|---|---|---|---|---|---|---|
| 1 | Title | `#/` | File | cold open; any "quit to title" | → new run, continue, card, settings | *is* the empty state | save discarded → "we couldn't read your last run" + start fresh | always legal |
| 2 | New run | `#/new` | File | title | ← title | — | — | always legal |
| 3 | Chargen — portrait | `#/chargen/face` | File | new run (full path) | ← new run (abandons) | — | — | restarts chargen; no partial chargen is saved |
| 4 | Chargen — moments | `#/chargen/1..6` | File | portrait step | ← previous moment; ← title from moment 1 | — | — | restarts chargen |
| 5 | Reveal | `#/reveal` | File | moment 6 | → hub (commits); ← re-roll the montage | — | — | no committed career → chargen |
| 6 | Career hub | `#/hub` | File | reveal, skip, daily, continue | → camp/life/offers/ladder/card/settings | no career → title | — | legal iff a career exists |
| 7 | Camp | `#/camp` | File | hub | ← hub | budget unspent → resolve disabled | — | hub if no career |
| 8 | Life | `#/life` | File | hub; auto after each camp week | ← hub | deck exhausted → "nothing this week" | — | hub if no career |
| 9 | Offers | `#/offers` | File | hub | ← hub | no offers (retired/injured) → why, and what fixes it | — | offers regenerate from the seed |
| 10 | Scouting | `#/scout/:i` | File | offers | ← offers; → accept | — | bad `:i` → offers | offers regenerate from the seed |
| 11 | Fight night | `#/fight` | Broadcast | accepted offer (via the §15.7 walkout) | → aftermath only; no back path **by design** | — | — | re-simulates from the bout seed, resumes at last completed round |
| 12 | Aftermath | `#/aftermath` | Broadcast → File | fight end | → hub; → card if retired | — | — | legal while an unacknowledged result exists |
| 13 | Ladder | `#/ladder` | File | hub | ← hub | unranked → "you are not ranked yet" + what ranks you | — | hub if no career |
| 14 | Career card | `#/card` | File | retirement; hub (active career) | ← hub; → title | no career → title | — | always legal with a career |
| 15 | Settings | `#/settings` | File | title; hub | ← wherever it was opened from | — | — | always legal |
| 16 | Lab | `#/lab` | File | hidden, typed | ← title | — | — | always legal |

**Fight night has no back path on purpose.** It is the one irreversible screen in the game, and the walkout (§15.7) exists to mark that boundary. It is the only exception to the back-path rule and it must be the only one.

**The daily run is a stamp, not a skin.** A daily career renders in The File exactly like any other, with a `DAILY · <date>` rubber stamp (§15.8's `Stamp`, `--stamp` vermilion) in the corner of the sheet on every File screen and the seed printed in the mono voice. No new tokens, no new palette, no third register.

*Discarded: a distinct accent colour for daily runs.* A third palette is a third register wearing a different hat, and §15.1 forbids it.

**Additions to the §15.8 component vocabulary.** These are kit components, built once, composed by screens:

- **`CommentaryFeed`** [Broadcast] — the three-line narration window (§16.6). Fixed node count; lines swap by text content, never by mounting rows.
- **`ScoutCard`** [File] — portrait, flag, name, nickname, record, gym, style, tendencies (§16.5). The three-second read.
- **`Ledger`** [File] — the fight-by-fight history strip: opponent face, result, method, headline (§16.5).
- **`ChoiceCard`** [both] — a labelled choice carrying a consequence chip. Replaces the bare `<button>` rows in `CornerChoice`, the amateur wrapper, and life events, so a choice never reads as a neutral verb.

### 16.4 Portrait vocabulary — the extension

§15.4's `FaceCode` is nine slots serialised base36. M7 adds three, taking it to twelve characters:

| Slot | Range | Why it earns its bytes |
|---|---|---|
| `build` | 5 | Frame is the first thing you read on a fighter and it is visible at 24px, where a nose shape is not. |
| `marks` | 12 | Tattoos and birth-scars as an authored feature, in the `mk-*` symbol namespace. |
| `gear` | 8 | Corner gear: glove tape, shorts block, corner towel. Lowest yield of the three — **cut this first if the SVG sub-budget binds**. |

Existing slots widen where the cost is a handful of small paths: `hair` to 10 variants, `facialHair` to 8, `hairColor` to 6.

**Visual stance is read from `Fighter.stance`, not from a `FaceCode` slot.** The field already exists, is already generated 85/15 by `matchmaking.ts`, and is already shown on the tale of the tape. A separate portrait slot could disagree with it, and a southpaw drawn in an orthodox stance is a visible lie for zero benefit. `<Portrait>` takes `stance` as a prop.

*Discarded: a thirteenth slot for stance.* Rejected because it can contradict data the same screen is displaying.

**Marks are not wear, and the two must never share a namespace.** `marks` is authored/seeded and permanent; wear is derived by `faceWear` and grows with the career (§15.4). They render in separate SVG layers (`mk-*` vs `wr-*`) so `faceWear` never has to know a fighter has tattoos. The §15.4 contracts are untouched: nothing about a face is stored except the `FaceCode`, wear stays a pure function, and `/engine` still never reads `face`.

**Sub-budget.** §15.9 allots 14KB of inline SVG for faces, flags, and plates together. Flags take 1.5KB (Loop 6.3) and plates 6KB (Loop 6.9), leaving **6.5KB for faces** — measured, not estimated, at the end of the loop. If the extended dictionary does not fit: cut `gear`, then reduce `marks` to 8.

### 16.5 Non-visual identity

**Three fields on `Fighter` are currently inert, and the design already promises they are not.**

| Field | Status today | §-promise it breaks |
|---|---|---|
| `weakness` | Never read by anything. Generated opponents always get `null`. | §4.2 "the explicitly-named exploitable hole"; §9.2 shows it to the player as a payoff |
| `traits` | Never populated, never read. `traitUnlockThreshold` sits unused in `balance.json`. | §4.2 "a documented modifier applied inside the engine" |
| `fightIQ` | Feeds the `mind` pillar; `mind` is read by nothing but the radar chart. | §6.6 "IQ as the fidelity of information surfaced to the player" |

M7 makes `weakness` and `fightIQ` real. **Traits stay deferred** — they need seven engine modifiers plus an equip surface, no M7 package depends on them, and pretending otherwise inflates a milestone that is already splitting in two. This is a standing gap, recorded here so it stops being invisible.

**`weakness` becomes an engine modifier.** One constant, `weaknessPenalty`, in `balance.json`, applied at exactly one contested roll per weakness id:

| `WeaknessId` | Applied where |
|---|---|
| `striking-defense` | the defender's striking value in `resolveStrike` |
| `takedown-defense` | the defender's grappling value in `resolvePositionChange` for a takedown |
| `submission-defense` | the defender's grappling value in the submission roll |

Deterministic, no new randomness, tuned in the lab like everything else. Generated opponents draw a weakness (or `null`) from their seeded stream, so scouting has something true to point at and the player's weakness stops being a unilateral handicap.

**Style descriptors must be computations, not adjectives.** Each descriptor is a predicate over real `Attributes`; there is no descriptor without one.

| Descriptor | Predicate |
|---|---|
| Pressure striker | `striking ≥ 60 && power ≥ technique` |
| Technician | `technique ≥ 70 && technique − power ≥ 15` |
| Chain wrestler | `wrestling ≥ 70` |
| Top-control grinder | `groundControl ≥ 70 && groundControl > wrestling` |
| Front-runner | `cardio ≤ 50 && speed ≥ 60` |
| Late-rounds grinder | `cardio ≥ 70` |
| Granite | `chin ≥ 75` |
| Suspect chin | `chin ≤ 45` |
| Reads the fight | `fightIQ ≥ 70` |

**Cut, for having no backing field:** anything about heart, killer instinct, fight-week discipline, or durability-under-pressure. They are not in `Attributes`, they are not in `Origin`, and inventing them would make the scout card decorative — which is the exact failure this section exists to prevent.

**`fightIQ` becomes scouting fidelity, per §6.6.** The scout card shows tendencies drawn from the table above, and the player's own `fightIQ` decides how many and how honest:

| `fightIQ` | Tendencies shown | Accuracy |
|---|---|---|
| ≥ 70 | 3 | all true |
| 45–69 | 2 | all true |
| < 45 | 2 | **one is drawn from the predicates the opponent fails**, shown with identical confidence |

No hidden `+X` anywhere. A low-IQ fighter is not weaker; they are *misinformed*, which is what §6.6 asks for and what makes the stat felt.

**Records.** Generated opponents have no record at all today, which makes the §15.8 `FighterIdentity` component's "record" field unfillable and makes an opponent unreadable as a person. `Fighter` gains `record: { wins, losses, draws }` as a flavour field (`/engine` never reads it, same status as `nationality`, `stance`, and `face`), seeded and scaled to the opponent's ladder position. **`CareerState.record` is removed and `career.player.record` becomes the single source.** Two copies of a fighter's record is a drift bug waiting for a long career.

*Discarded: keeping both and testing that they agree.* A test asserting two copies of one fact stay equal is a description of the bug, not a fix.

**Nicknames.** `content/names/nicknames.json`, two-part (`{adjective} {noun}`) plus a standalone pool, weighted by archetype and nationality, drawn from the opponent's seeded stream. **Roughly 65% of fighters get one** — universal nicknames devalue the nickname. A trademark denylist (§16.9) rejects real fighters' monikers in CI.

**How an opponent reads as a person in three seconds.** The `ScoutCard` carries seven signals, every one of them seeded and backed: face (with wear) · flag · name + nickname · record · gym · style descriptor · tendencies. Face and record are pre-attentive — the player reads them before reading anything. The nickname is the mnemonic handle that survives the fight.

**What makes the player remember beating them six fights later: the ledger.** §8.5 already promises a career card naming "the rival you never beat" and "three highlight fight-moments," and nothing implements either. `FightSummary` gains four compact fields:

```ts
opponentName: string; opponentFaceCode: string; opponentNickname: string | null;
headline: string;   // the narration line that fired at the bout's highest-salience beat
```

~120 bytes per fight, ~3KB across a full career, and **no event log is retained** — §2 holds exactly as written. The `Ledger` component renders it on the hub and the career card; the rival is derived (the opponent with the worst result against, or a rematch lost twice). The player's memory is made of the sentence they actually read at the time, which is the only kind of memory this game can honestly manufacture.

### 16.6 Live fight narration

**The engine does not change.** `simulateFight` emits `FightEvent`s as it already does. Narration is a selection layer over the finished `FightResult`, living in `/content/narration/*.json` plus pure code in `/narration`. No randomness enters `/engine`; no `Math.random` enters the selector.

**Two stages, because 85 events is not 85 lines.**

```
FightResult ──beats.ts──> Beat[] (~21) ──select.ts──> NarrationLine[] ──slots.ts──> string[]
              pure, no rng            pure, seeded         pure, total
```

**Stage 1 — beat extraction (no RNG at all).** A pure fold over `events[]` plus the terminal `FightResult`, producing thirteen kinds:

`open` · `exchange` · `takedown` · `stuffed` · `ground` · `standup` · `submission` · `rocked` · `moment` · `corner` · `roundEnd` · `finish` · `decision`

`open` and `decision` are **synthetic** — the log contains neither. Runs of landed strikes collapse into a single `exchange` beat carrying total damage, the streak length, and who owned it; a `position: topControl` immediately following a successful takedown is absorbed into the `takedown` beat rather than narrated twice. This is where the 85→21 reduction happens and where meaning is computed (who is winning the exchange, who is fading, whether this is a comeback).

*Discarded: one line per event, throttled by a display queue.* It sets line demand at ~85 per bout, which no affordable pool can cover without repeating inside a single round, and it produces the mechanical log with prose paint rather than commentary.

**The per-round beat budget is 7.** Mandatory beats (`open`, `corner`, `moment`, `rocked`, `roundEnd`, `finish`, `decision`) always narrate. Optional beats (`exchange`, `takedown`, `stuffed`, `ground`, `standup`) compete for the remaining slots on a salience score:

```
base: rocked 90 · submission 70 · moment 60 · corner 50 · takedown 45 · stuffed 35 · standup 30 · ground 25
exchange: 10 + 4 × totalDamage + 3 × unansweredStreak
```

Measured against the observed distribution this yields ~21 narrated beats per bout, ~46–55 seconds of fight night.

**Stage 2 — selection, on its own seeded stream.** This is the subtle part. `FightScreen` **re-simulates the whole bout** every time the player makes a corner call or plays a moment. If narration drew from the fight's RNG instance, every corner call would re-narrate the already-displayed prefix with different lines. So:

```ts
narrationRng = mulberry32(seedFromString(`${boutSeed}:narration`))
```

An independent stream from the same seed, consuming nothing from the fight's. Combined with two rules, the displayed prefix is provably stable:

1. **Exactly one `rng.next()` per beat, unconditionally** — even when only one candidate matches. Divergence at beat *k* can then never shift the stream for beats before it. This is the same discipline the moment overrides already use.
2. Beats are walked in order, and selector state (cooldowns, the anti-repeat window) is a pure function of the prefix.

A replayed seed narrates identically. That is the contract, and it is testable.

**Line schema.**

```ts
interface NarrationLine {
  id: string;                              // unique; doubles as the cooldown key
  on: BeatKind;
  when?: Predicate;                        // structured data, never code
  tags?: string[];                         // 'ground' | 'fatigue' | 'loud' | 'needsNickname' | ...
  voice: 'pbp' | 'colour';
  weight?: number;                         // default 1
  priority?: number;                       // default 0 — higher tiers EXCLUDE lower
  cooldown?: 'fight' | 'round' | 'none';   // default 'round'
  text: string;                            // slot template
}
```

Slots: `{A}` `{B}` `{NICK_A}` `{NICK_B}` `{LAST_A}` `{LAST_B}` `{GYM_A}` `{GYM_B}` `{R}` `{N}` `{TECH}`.

**Slot resolution is total.** A fighter without a nickname must never render `{NICK_A}`. Lines using an optional slot carry the matching tag (`needsNickname`, `needsGym`) and the selector filters them out when the slot is unavailable — never a fallback string, which is how "Riko 'undefined' Tanaka" reaches a screenshot.

**Priority excludes rather than outweighs.** If any candidate at priority 2 matches, only priority-2 candidates are eligible. That is how "he is out cold" beats "that landed clean" without weight-fiddling.

**Repetition control, three layers.** `cooldown: 'fight'` fires at most once per bout; `'round'` at most once per round; plus a **global anti-repeat window of the last 6 line ids**, ineligible regardless of cooldown class. The window is what actually kills the "same three lines alternating" failure.

**The selector is total.** If filtering empties the candidate set, it relaxes in a fixed order: drop the anti-repeat window, then the cooldown, then fall back to the beat kind's unconditional line. **Every beat kind must carry at least one line with `cooldown: 'none'` and no `when`** — that floor is what makes the fallback chain terminate, and it is asserted by the coverage test.

**Coverage matrix and its enforcement.** A test walks the `BeatKind` union and the **reachability manifest** (§16.1's list) and fails on any kind below its floor:

| Beat kind | Floor | Sub-floors |
|---|---|---|
| `exchange` | 40 | ≥6 in each of heavy / light / one-sided / answered / ground |
| `roundEnd` | 24 | ≥6 in each of plain / fatigue / lead-or-comeback / scorecard |
| `moment` | 18 | ≥3 per kind × outcome |
| `finish` | 18 | ≥6 per method (KO / TKO / SUB) |
| `takedown` | 14 | — |
| `open` | 14 | — |
| `stuffed` | 12 | — |
| `rocked` | 12 | — |
| `decision` | 12 | ≥3 per verdict (UD / SD / MD / DRAW) |
| `standup` · `ground` · `submission` · `corner` | 10 each | `submission` ≥4 per outcome |
| **Floor total** | **204** | plus ≥60 lines tagged `voice: 'colour'` |

The manifest is checked **in both directions** by a companion test that runs 500 seeded bouts with corner tactics supplied and asserts the observed variant set *equals* the manifest. Make `position: 'clinch'` reachable and the test fails until lines exist for it; break `knockdown` and the test fails too. A naive enum walk can only catch one of those.

**Register and voice — this is Broadcast, so it is commentary.** Two voices, because one voice has to do two jobs and ends up doing neither:

- **Ray Mensah, play-by-play (`pbp`).** Present tense. 6–14 words. Names the action and the fighter. Never explains, never uses a number the HUD is not already showing.
- **Kass Ferreira, colour (`colour`).** A retired champion of the fictional promotion. 10–20 words, past-tense fragments, explains *why*. Fires on roughly one beat in three, never twice consecutively, and never as the first line on a `finish`.

Sample lines, to fix the tone rather than describe it:

```
pbp     exchange/heavy     {A} steps in behind the jab and lands it clean.
pbp     exchange/heavy     Right hand down the pipe. {B} wore all of that one.
pbp     exchange/one-sided That is six unanswered now. {B} is just covering up.
colour  exchange/one-sided {B} has stopped moving his head. That is how rounds get taken away from you.
pbp     exchange/light     {A} pops the jab, keeps {B} honest.
pbp     takedown           {A} changes levels and puts {B} on the deck.
colour  takedown           Beautiful timing off the low kick. {NICK_A} has been baiting that all round.
pbp     stuffed            {B} sprawls. {A} comes up holding an ankle and nothing else.
colour  stuffed            That shot cost him more gas than it cost {B}.
pbp     standup            {B} works back to the fence and stands up. Crowd likes that.
pbp     rocked             {B} is hurt! The legs went out from under him.
colour  rocked             He is fighting on instinct now. Next thirty seconds decide this.
pbp     submission/locked  It is under the chin. {B} has to answer this right now.
pbp     moment/scramble    {A} wins the scramble and comes up on top. Composure.
pbp     roundEnd/plain     There is the horn. Round {R} in the books.
colour  roundEnd/fatigue   Watch {A} walking back — hands on the hips. The tank is a question now.
colour  roundEnd/lead      Two rounds banked for {A}. {B} needs a finish and he knows it.
pbp     finish/KO          That is it! {B} is out and {A} is already up on the fence.
pbp     finish/SUB         He taps! {A} gets it, and {GYM_A} empties into the cage.
colour  decision/SD        Nobody in this building agrees on that fight, and I am not sure I do either.
pbp     open               {A}, out of {GYM_A}, {N}. Across from him, {B}.
```

**Pacing: narration leads, the tape stays.** The mechanical `PlayByPlay` log becomes "the tape" — collapsible, mono, off by default, and still the surface that proves HUD and log agree (Loop 6.8's audit). `CommentaryFeed` becomes the focal element: a **three-line window**, the current line at full weight and the previous two at reduced opacity, with a fixed node count so §2's reuse rule holds.

Playback is re-paced from events to beats. The reveal clock advances a *beat*, and all events belonging to that beat reveal together so the event-derived HUD never lags its own narration.

```
beatInterval = min(2600ms, 700ms + 26ms × line.length)
```

**When a beat would arrive faster than its line can be read, it cannot** — the clock is beat-driven, so events never outrun the prose. The real collision is pre-emption: a `finish` beat arriving while a colour line is mid-reveal. The finish always wins; the in-flight line snaps to complete and the feed takes the finish. Only one line is ever revealing at a time. Under `prefers-reduced-motion: reduce`, lines appear whole with no per-character reveal. By keyboard: space toggles, `→` advances one beat. "Skip to end" reveals the remainder without narrating it, matching the existing behaviour.

**Volume and cost, measured.** Sampling real prose at the schema above: **221 raw / 41 gzip bytes per line**. The floor of 204 lines and an authored target of **~260** (headroom above the floor, so the test is not sitting on the line) costs **~52KB raw / ~9.6KB gzip**, plus ~60 corner lines (§16.7) at ~2.4KB gzip.

At ~21 beats per bout and ~20 bouts per career, a run fires roughly 420 lines. The dominant load is `exchange` at ~11 firings per bout; with a 40+ line exchange pool, five sub-conditions, cooldowns and the anti-repeat window, a repeat *inside a single bout* is effectively impossible, and across a career the player sees most of the pool — which is what a broadcast actually sounds like.

**Narration content ships as a lazily-imported chunk.** §16.9 has the arithmetic: the initial bundle cannot absorb it. It is imported on entry to fight night, Zod-validated and frozen at that point, and cached for the session.

**This bends §2's "validated at boot" rule and the bend must be stated.** §2 wants Zod to catch malformed content at boot rather than mid-fight. Mitigation: a CI test imports and validates **every** content file, including the narration pools, so malformed content cannot ship at all; the runtime validation becomes a shipping-integrity check whose failure path is "commentary off, tape on" — degraded, never a crash, and never mid-bout since the load completes before the walkout.

**Trademark safety (§13).** No real promotion, event, venue, fighter, or commentator name appears in any pool. The fictional promotion is the **Vantage Fight League (VFL)**; the cage is "the cage" and its wall is "the fence" — "Octagon" is a Zuffa mark and is banned outright. Commentators are fictional. A CI content lint runs a denylist regex across every JSON file under `/content` (org names, "octagon", "zuffa", and a list of real fighters' nicknames) and fails the build on any hit. *The VFL name is a working name and must be trademark-cleared before any public release.*

### 16.6a Per-minute checks as beats (amendment — no second narration system)

§6.6a's per-minute checks slot into the beat pipeline that already exists here; they are not a second narration system.

- **A check is a `FightEvent` (or a small run of them) at the point it's emitted, and becomes a `Beat` through the existing Stage 1 fold** — no new `BeatKind` is required in the general case. A striker's successful check is an `exchange` (or `takedown`) beat; a grappler's stuffed check is a `stuffed` beat; the mapping from "what kind of check, who won, by how much" to beat kind and its salience inputs (`totalDamage`, `unansweredStreak`, etc.) is exactly the aggregation Stage 1 already performs — the only change is that the input stream is now chunked into fixed one-minute slices instead of whatever finer cadence produced events before.
- **No fixed filler/result alternation.** The New Star Soccer-style rhythm (atmosphere line, then a result-bearing line) is not a hardcoded 1:1 rule. It falls out of the existing salience system (§16.6's beat budget of 7/round and the `base`/`exchange` salience scores): a low-salience check reads as filler because it competes for a narration slot and often loses; a high-salience check (a knockdown check, a big unanswered-streak check) wins a slot and reads as the result line. Since a 5-minute round now produces up to 5 check-beats plus whatever `roundEnd`/`corner`/`moment` beats already exist, the per-round beat budget and its salience competition are what shapes the rhythm — this may mean re-measuring the budget (see open question below) rather than adding a second pacing rule.
- **Still one narration RNG stream, one selection pass.** Checks introduce no new `rng.next()` call site outside what Stage 2 (§16.6) already does — exactly one draw per beat, check-beats included.
- **Open question carried into implementation:** at up to 5 check-beats per round (15 per 3-round bout) competing with `open`/`corner`/`moment`/`roundEnd`/`finish`/`decision` beats against the existing 7-per-round budget and the measured ~21-beats-per-bout target, the budget or the salience constants may need re-tuning so checks don't crowd out mandatory beats or blow past the measured pacing (~46–55s of fight night, §16.6). This is a tuning pass against real output, not a design decision to make blind — flag before Loop 7.11/7.12 rework, and re-measure against the coverage matrix (§16.6) once check-beats are live.

### 16.7 The corner's voice

Between rounds the coach speaks, and the three options stop being neutral verbs.

Each `TacticId` is presented as a `ChoiceCard`: the coach's **instruction** in their own voice, plus a **consequence chip** stating the trade honestly ("costs stamina", "gives up the takedown", "you stop scoring").

```
calm        pressPace     "Same pace. Don't chase him — make him come to the jab."
furious     pressPace     "He's done! Walk him down and take it away from him, right now."
analytical  pressPace     "He drops the right hand when he steps back. Press and make him step back."
gambler     headhunt      "Forget the points. One clean shot and we all go home early."
calm        protectLead   "You're up two. Don't be a hero — take the fight to the horn."
furious     shootTakedowns "Put him on his back and don't let him up. I don't want to see a third round."
```

**Which advice is offered, and whether it is right, is where `fightIQ` and the coach meet.** The corner recommends one tactic; the recommendation matches the situation the beat extractor computed with a probability derived from the coach's `acuity` and the fighter's `fightIQ`. Temperament biases *which* tactic gets recommended (`gambler` leans `headhunt`/`pressPace`; `calm` leans `protectLead` when ahead; `analytical` writes the most accurate consequence chip).

**Following good advice is not a buff.** The recommended tactic is marked in the UI and its consequence chip is accurate when the advice is sound and misleading when it is not. The value of following the corner is that the tactic is usually genuinely better on the merits — never a hidden bonus. §6.6 is explicit: IQ is fidelity of information, not `+X` on a roll.

### 16.8 Gym, coach, and team

All generated from the career seed (§16.2), all mechanically real.

**Gym.**

```ts
interface Gym { id: string; name: string; city: string; country: string;
                specialty: 'striking' | 'grappling' | 'conditioning';
                reputation: number; /* 0..100 */ dues: number; /* per week */ }
```

Three effects, all in `camp` resolution — a gym that does not touch camp does not ship:

1. `specialty` multiplies training gains: `specialtyMultiplier` (≈1.35) on the attributes in its group, `offSpecialtyMultiplier` (≈0.85) elsewhere. Both in `balance.json`.
2. `reputation / 100` **replaces** `defaultTrainingPartnerQuality`'s flat 0.75 as the ceiling on training-partner quality; the `trainingPartners` life bar becomes a modulation of that ceiling rather than an absolute.
3. `dues` is a weekly purse drain — the money pressure §8.3 promises under "sponsors: gym dues unpaid" and which currently does not exist anywhere in the code.

**Gyms close a hook that has been dangling since M4.** `Origin.mentorGymId` is authored by the amateur wrapper (`ironside-mma`, `golden-gate-boxing`, `apex-grappling`, defaulting to `neighborhood-gym`), carried through `startCareer`, persisted — and read by nothing, because `content/gyms.json` is the two-character file `{}`. Those four ids become **authored anchor entries** (the wrapper's prose already refers to them by character); every other gym is procedural from name parts. The mentor gym is where the player starts.

**Gyms can be changed, or `specialty` is a dice roll wearing a mechanic's coat.** After any fight the aftermath may offer a move: costs money, resets `trainingPartners` to 50, changes the specialty bias from the next camp week.

**Coach.**

```ts
interface Coach { id: string; name: string;
                  background: 'boxing' | 'wrestling' | 'bjj' | 'kickboxing' | 'allround';
                  temperament: 'calm' | 'furious' | 'analytical' | 'gambler';
                  acuity: number; /* 0..100 */ }
```

`temperament` selects the corner's line pool (§16.7). `acuity` sets corner-advice quality alongside `fightIQ`. `background` biases which tactic the coach reaches for and supplies `{GYM}`-adjacent colour in the open beat.

**Teammates are cut as a system, and that is the honest answer.** The camp energy budget, the `trainingPartners` life bar, and gym reputation already cover "who you train with changes your gains." Named teammates with their own bars would be a second decay system feeding the same channel — content and state for no new decision. What survives is exactly one named **training partner** with **zero independent state**: a name and a face code derived from the gym's seed, appearing as `{PARTNER}` in life events and corner lines. Presence in the prose, no mechanics to maintain.

### 16.9 Budgets, determinism, and what M7 puts under pressure

**The gzip ceiling is the binding constraint and it is nearly spent.** Measured, not projected:

| | gzip |
|---|---|
| Current build (measured) | 55.3 KB |
| M6 fonts (§15.3, woff2 — already compressed) | 60 KB |
| M6 CSS (§15.9 ceiling) | 7 KB |
| M6 inline SVG + JS delta | ~10 KB |
| **Projected after M6** | **~132 KB** |
| §15.9 total ceiling | **150 KB** |
| **Headroom for all of M7** | **~18 KB** |

M7's JS alone (narration, beats, identity, gym, routing) is ~25KB raw ≈ 8KB gzip, which leaves ~10KB for content that measures ~12KB. **M7 as specified breaches the ceiling by a few KB if everything ships in the initial bundle.** Hence §16.6's lazy chunk: narration content is fetched on entry to fight night and is not initial transfer. Two separate CI checks replace the one:

- **Initial transfer ≤ 150 KB gzip** (unchanged — the ceiling is the discipline).
- **Narration chunk ≤ 13 KB gzip.**

If the initial budget still binds, the levers in order: drop Archivo Condensed and set display type from the Archivo variable font (−13KB); cut narration to the 204-line floor (−2KB); cut the `gear` portrait slot.

*Discarded: raising the 150KB ceiling to 175KB.* A route-split chunk is strictly better than a larger download for a screen the player may not reach for a minute.

**Inherited constraints M7 puts under pressure — and how each is held:**

| Constraint | Pressure | Held by |
|---|---|---|
| `/engine` purity | `weakness` becomes an engine modifier; `Fighter.record` is added | Both are deterministic data. No RNG, no clock, no DOM. `record` is flavour the engine never reads. The Appendix B check gains `/narration` to its forbidden-import list. |
| Determinism | Narration must replay identically across re-simulation | A separate stream from the same seed, one `rng.next()` per beat unconditionally (§16.6) |
| Determinism | Three `Date.now()` call sites make career fights unreproducible | The career seed (§16.2) removes all three |
| No raster assets | Portraits gain three slots | Still inline SVG. Sub-budget in §16.4, CI rule unchanged |
| Contrast ≥ 4.5:1 | Commentary is body prose on `--canvas` | `--bone` (17.10:1) for the current line; the dimmed history lines must be re-measured against `--bone-soft` (6.67:1) at their actual opacity |
| Keyboard-completable | Fight night gains a paced feed; scouting and life gain screens | Space/`→` on the feed; every new screen's primary action tabbable; `?` opens the key map |
| `prefers-reduced-motion` | Per-character line reveal | Lines appear whole; beat pacing continues (it is timing, not motion) |
| §2 content frozen at boot | Narration loads lazily | CI validates every pool at build time; runtime failure degrades to the tape, never crashes (§16.6) |
| §2 event logs discarded | The ledger keeps something per fight | Four scalar fields on `FightSummary`, ~120 bytes. No log, no beats, no `WearLayers` persisted |
| §2 one store | Four new screens | All slices of the existing store. No per-screen stores |

---

## Appendix A — balance.json starting values (tune in the lab)

```json
{
  "k": 13,
  "kFinish": 10,
  "staminaDrainBase": 1.0,
  "cardioDrainScale": 0.6,
  "cutPenaltyBotched": 0.82,
  "cutPenaltyClean": 1.0,
  "traitUnlockThreshold": 85,
  "maxEquippedTraits": 2,
  "weeklyDecay": { "partner": 4, "hype": 3, "sponsor": 3, "trainingPartners": 5 }
}
```

**M7 additions (§16).** `weaknessPenalty`, `specialtyMultiplier`, `offSpecialtyMultiplier`, `gymDuesBase`, `coachAcuityMin`/`coachAcuityMax`, and a re-tuned `baseStrikeDamage` (§16.1 — the current `0.3` makes `knockdownHealthThreshold` and `tkoHealthThreshold` unreachable). All tuned in the lab against §10's gates, never by feel.

## Appendix B — engine purity checklist (CI should enforce)

- [ ] `/engine` imports nothing from `/ui`, `/state`, `/career`, `/narration`.
- [ ] `/narration` imports nothing from `/ui` or `/state`, and contains no `Math.random`, `Date`, `window`, or `document` (§16.6).
- [ ] No `Math.random`, `Date`, `window`, or `document` anywhere under `/engine`.
- [ ] `simulateFight(sameSeed, sameInputs)` is byte-identical across runs (test).
- [ ] Full event log is discarded after playback; only `FightSummary` persists.
- [ ] All tunable numbers live in `balance.json`, not inline in engine code.
