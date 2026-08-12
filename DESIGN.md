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
  /content
    attributes.json
    archetypes.json
    events/*.json
    names/*.json      # nationality-weighted name pools
    gyms.json
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

**Enforcement:** add an ESLint rule or a CI check that fails if anything under `/engine` imports from `/ui`, `/state`, or references `document`, `window`, `Math.random`, or `Date`.

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
  | { t: 'playerMoment'; round: number; kind: MomentKind; outcome: 'success' | 'fail' }
  | { t: 'roundEnd'; round: number; scoreA: number; scoreB: number }
  | { t: 'finish'; who: string; method: string; round: number };
```

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

`simulateFight(a, b, tactics, rng): FightResult`. Rounds resolve as a series of ticks. Two persistent pools per fighter: **health** and **stamina**, both drain, both feed back into effectiveness.

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

### 6.7 Corner decisions and player moments

- **Between rounds**, the corner offers 2–3 tactical choices with real trade-offs: press the pace (stamina cost), shoot for takedowns, protect a lead, headhunt for the finish. Each maps to tactic parameters the next round reads.
- **1–3 times per fight**, the sim yields control to the player for a discrete **moment** (a scramble, a submission escape, a finishing sequence). See §7.

---

## 7. The single interactive mechanic

Build **one** mechanic and reskin it. Recommended: a **timing bar** OR a **push-your-luck risk ladder**. Pick one; do not build both.

- Same component (`MomentBar`), different labels/stakes per `MomentKind`.
- Its outcome (`success | fail`) feeds back into the engine as a modifier to the current exchange, not as an instant win/loss (except an explicit finishing-sequence moment, which can end the fight).
- The moment must be *fair to skip*: an "auto-resolve" option resolves it via the engine so the game is fully playable without twitch input (accessibility + it keeps the sim authoritative).

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

## Appendix B — engine purity checklist (CI should enforce)

- [ ] `/engine` imports nothing from `/ui`, `/state`, `/career`.
- [ ] No `Math.random`, `Date`, `window`, or `document` anywhere under `/engine`.
- [ ] `simulateFight(sameSeed, sameInputs)` is byte-identical across runs (test).
- [ ] Full event log is discarded after playback; only `FightSummary` persists.
- [ ] All tunable numbers live in `balance.json`, not inline in engine code.
