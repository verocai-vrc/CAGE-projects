# Development Loops — CAGE

> **Audience:** developer AI agents working inside an IDE.
> **Depends on:** [DESIGN.md](DESIGN.md). This document does not restate architecture or mechanics — it sequences the work into small, verifiable loops. If a loop's instructions conflict with DESIGN.md, DESIGN.md wins.

---

## How to use this document

A **loop** is the smallest unit of work that ends in a verifiable, committable state: build → verify → commit. Do not start loop *N+1* until loop *N*'s exit criteria pass. Loops are grouped under the milestones defined in DESIGN.md §12 (M1–M5) and execute in order — later loops assume earlier ones are done.

Each loop lists:
- **Goal** — the one thing this loop proves.
- **Build** — what to create or change.
- **Verify** — the concrete check that proves the goal (a test, a CI rule, a manual smoke check). If verify fails, the loop is not done.
- **Exit artifact** — what should exist in the repo when the loop closes.

Keep loops small. If a loop's Build list grows past ~5 files, split it.

---

## Loop 0 — Repo scaffold

**Goal:** the project boots, builds, and lints with nothing in it yet.

**Build:**
- `npm create vite@latest` (vanilla-ts template), then swap in Preact per DESIGN.md §2.
- Install: `preact`, `zustand`, `zod`, `vitest`, ESLint + TS strict config.
- Create the directory skeleton from DESIGN.md §3 (empty files with a one-line export stub where needed).
- `tsconfig.json` with `strict: true`.
- ESLint rule (or a small custom script run in CI) enforcing the `/engine` purity checklist (DESIGN.md Appendix B): no imports from `/ui`, `/state`, `/career`; no `Math.random`, `Date`, `window`, `document` under `/engine`.
- GitHub Actions workflow: install → lint → typecheck → test → build, on every push.

**Verify:**
- `npm run build` succeeds with an empty app.
- `npm run lint` passes.
- CI workflow runs green on a throwaway commit.
- A test file that intentionally imports `document` inside `/engine` — CI must fail on it, then delete the test file once confirmed.

**Exit artifact:** empty-but-building repo, CI green, purity rule proven to actually catch violations.

---

## Milestone M1 — Engine + Lab

*Reference: DESIGN.md §4–6, §10, Appendix A/B.*

### Loop 1.1 — RNG

**Goal:** deterministic, seedable randomness — the foundation everything else depends on.

**Build:** `engine/rng.ts` — `mulberry32`, `seedFromString`, `rollLogistic(A, B, k, rng)` exactly as specified in DESIGN.md §5.

**Verify (Vitest):**
- Same seed → identical sequence of `next()` calls, across two separate `mulberry32` instances.
- `seedFromString` is stable for a given string across runs.
- `rollLogistic` respects monotonicity: higher `A - B` → higher empirical win rate over N=10,000 rolls at fixed `k`.

**Exit artifact:** `engine/rng.ts` + `tests/rng.spec.ts`, all green.

### Loop 1.2 — Core types + content schemas

**Goal:** the data model compiles and content validates.

**Build:**
- `engine/types.ts` — `Attributes`, `Fighter`, `Origin`, `FightResult`, `FightEvent` per DESIGN.md §4.
- `state/schema.ts` — Zod schemas mirroring the above.
- `content/balance.json` seeded with DESIGN.md Appendix A values.
- `content/attributes.json`, `content/archetypes.json` — minimal fixtures (2–3 archetypes) for engine testing, not final content.
- A tiny content loader (`content/index.ts` or similar) that loads + Zod-validates + `Object.freeze()`s content at boot (DESIGN.md §2 memory rules).

**Verify:**
- Zod schema rejects a deliberately malformed fixture (missing field, out-of-range attribute).
- Content loader throws a clear error on invalid JSON, not a silent pass.
- `tsc --noEmit` clean.

**Exit artifact:** typed data model + working content pipeline with a test proving validation actually fires.

### Loop 1.3 — Stamina/health tick loop (no damage yet)

**Goal:** the stamina feedback loop (DESIGN.md §6.3) runs and produces plausible fade curves, before anything can be damaged or finished.

**Build:** `engine/round.ts` — per-tick stamina drain scaled inversely by cardio; stamina as a multiplier on a placeholder "accuracy" number. No strikes/damage/finishes yet.

**Verify:** unit test running N ticks for a low-cardio vs high-cardio fighter; assert the low-cardio fighter's stamina curve drops measurably faster and crosses a "faded" threshold earlier.

**Exit artifact:** isolated, tested stamina mechanic — the single loop DESIGN.md calls "worth more than ten extra attributes."

### Loop 1.4 — Striking, position, and damage/finish rolls

**Goal:** `effectiveChin` and the KO/finish probability curve (DESIGN.md §6.2, §6.4) work in isolation.

**Build:** extend `round.ts` with strike resolution (`rollLogistic` on striking pillar deltas), position changes (grappling pillar deltas), and `effectiveChin`-gated finish rolls per §6.4. Submissions reuse the same form on the grappling delta.

**Verify:**
- Unit test: a fighter with power fixed high and an opponent's chin/health/stamina artificially collapsed toward 0 has finish probability approaching 1 (sanity bound on the logistic).
- Unit test: identical inputs + identical seed ⇒ byte-identical sequence of `FightEvent`s (first instance of the determinism contract from DESIGN.md Appendix B — keep this test, it gets reused).

**Exit artifact:** strikes, position changes, and finishes all resolve through the shared logistic form, no special-cased scripting.

### Loop 1.5 — Judging

**Goal:** scorecards and decisions per DESIGN.md §6.5.

**Build:** `engine/judging.ts` — round scoring from strike differential, control time, knockdowns, submission threats; `content/judges.json` with 2–3 named judges carrying bias vectors + noise.

**Verify:** unit test running the same fight tape through judges with different bias vectors produces different scorecards (proves bias is live, not decorative); a fight that goes the distance with no clear edge produces a plausible split-decision rate over many seeded runs.

**Exit artifact:** `judging.ts` + `judges.json`, tested independently of the round loop.

### Loop 1.6 — Weight-cut modifier

**Goal:** cut quality feeds into the fight as a modifier, per DESIGN.md §6.4/§8.2 (fight-week resolution only — camp-long management is M4).

**Build:** `engine/weightcut.ts` — a pure function `(cutQuality) => cutPenalty` reading `cutPenaltyBotched`/`cutPenaltyClean` from `balance.json`, applied into `effectiveChin`/power/cardio.

**Verify:** unit test — botched cut measurably lowers a fighter's win rate against an identical opponent over N seeded fights, clean cut does not.

**Exit artifact:** `weightcut.ts`, wired into `fight.ts`.

### Loop 1.7 — `simulateFight` — assemble the engine's public API

**Goal:** the full pipeline described in DESIGN.md §6 exists behind one function.

**Build:** `engine/fight.ts` — `simulateFight(a, b, tactics, rng): FightResult`, composing rounds → judging → cut modifiers into the full event log + summary. `engine/index.ts` exports only the public surface.

**Verify:**
- Determinism test at the full-fight level: `(seed, fighterA, fighterB, tactics)` ⇒ byte-identical `FightResult` across two runs. This is the canonical test from DESIGN.md Appendix B — keep it permanently in the suite.
- `FightResult.summary` is well-formed and small; full `events[]` is present but the test explicitly checks nothing outside `summary` is what gets persisted later (contract test for the M1→state boundary, even though persistence isn't built yet).

**Exit artifact:** a working, pure, deterministic `simulateFight`. This is the core of the whole project — do not proceed to the lab until this loop's tests are rock solid.

### Loop 1.8 — Balance lab: batch runner + report

**Goal:** DESIGN.md §10's acceptance gates are measurable.

**Build:**
- `lab/simulate.ts` — run N=10,000 seeded sims across all archetype-pairing fixtures from Loop 1.2.
- `lab/report.ts` — win-rate matrix, finish-rate distribution, avg round length, stamina-fade curves.
- `lab/LabScreen.tsx` — minimal render of the report (table/text is fine, no styling investment yet).
- Wire into the hash router at `#/lab` (router itself can be the ~20-line stub from DESIGN.md §11, built here if not already present).

**Verify (this is the M1 exit gate, DESIGN.md §12):**
- No archetype fixture wins >~60% against the field average.
- The matchup-over-rating property is demonstrably true: run one deliberately-constructed matchup (high-grappling/lower-overall vs high-striking/higher-overall) and confirm the specialist wins at a measurable, non-trivial rate in its favorable matchup.
- Finish-rate distribution is in a documented, believable band (write the target numbers into a comment in `report.ts` once chosen).

**Exit artifact: M1 is done.** `/lab` renders real numbers, the matchup-over-rating property is provable, `simulateFight` is deterministic and unit-tested. This is the milestone DESIGN.md explicitly flags as the project's proof of viability — do not let it slip in quality to hit a date.

---

## Milestone M2 — Fight viewer

*Reference: DESIGN.md §6.7, §7, §4.4.*

### Loop 2.1 — Event log playback shell

**Goal:** a `FightResult.events[]` can be replayed on screen at a controllable pace.

**Build:** `ui/screens/FightScreen.tsx`, `ui/components/PlayByPlay.tsx`. Reuse DOM nodes per DESIGN.md §2 memory rules (no mount/unmount storm) — drive reveal via `requestAnimationFrame`/CSS transitions.

**Verify:** manual smoke test — load a fixed `FightResult` fixture (from a Loop 1.7 test seed) and confirm playback renders events in order, at a readable pace, without dropped frames on a throttled-CPU profile in devtools.

**Exit artifact:** a fight replays visually from a static fixture.

### Loop 2.2 — Scorecards + HUD

**Goal:** live health/stamina bars and running scorecards during playback.

**Build:** `ui/components/HudBar.tsx`, `ui/components/StatRadar.tsx` (reused later at the reveal screen too — build it generically now). Wire to the `roundEnd`/`knockdown` events already in the log.

**Verify:** manual check against 3 fixture fights (a KO, a decision, a submission) — bars and scorecards track the actual event log values at every point, no drift.

**Exit artifact:** HUD reflects fight state accurately for all three finish types.

### Loop 2.3 — Corner decisions

**Goal:** between-round player choices (DESIGN.md §6.7) actually change the next round's tactics.

**Build:** `ui/components/CornerChoice.tsx`. Extend `fight.ts`/`round.ts` to accept a mid-simulation tactic update — decide now whether corner choices are precomputed into `tactics` up front (simpler, keeps engine call-signature pure) or require the engine to pause/resume. **Recommendation: precompute is simpler and preserves purity — a corner call is just a tactics-array entry keyed by round, decided by the player via a live prompt during playback, then engine resolution proceeds already knowing it.** If that doesn't hold up under implementation, flag the conflict per DESIGN.md's front-matter instruction rather than silently redesigning the engine boundary.

**Verify:** unit test — two identical seeds/fighters, different corner choice at round 2, produce diverging `FightEvent` sequences from round 2 onward (proves the choice is load-bearing, not cosmetic).

**Exit artifact:** corner choices measurably affect fight outcomes.

### Loop 2.4 — The one player-moment mechanic

**Goal:** DESIGN.md §7's single mechanic, built once, reskinned per `MomentKind`.

**Build:** `ui/components/MomentBar.tsx` (timing bar OR risk ladder — pick one per §7, do not build both). Wire `outcome: success|fail` back into the engine as an exchange modifier, with an auto-resolve path for skip/accessibility.

**Verify:**
- Manual playtest: trigger a moment, both play it manually and hit auto-resolve, confirm both paths are fully playable and the auto-resolve path is engine-authoritative (same probability model as a skipped moment would get internally).
- Unit test: auto-resolved moment outcome distribution is not degenerate (not always success or always fail) over N seeded trials.

**Exit artifact: M2 is done.** A fight is fully watchable and playable end to end from a static fixture, corner calls and moments both matter, and the game is completable with zero twitch input.

---

## Milestone M3 — Career shell

*Reference: DESIGN.md §8.1, §8.2 (camp side), §8.4, §11.*

### Loop 3.1 — Zustand store + persistence skeleton

**Goal:** one sliced store, save/load round-trips.

**Build:** `state/store.ts` (single store, sliced per DESIGN.md §2), `state/persist.ts` — versioned `localStorage` key, debounced writes, Zod-validated load with a migration-or-clean-restart fallback (never crash, per DESIGN.md §11).

**Verify:** unit test — save, corrupt the stored JSON, reload: app falls back to clean restart, does not throw. Save/load round-trip test with a real store shape.

**Exit artifact:** persistence that fails safe.

### Loop 3.2 — Camp weeks: energy allocation

**Goal:** the core scarcity loop (DESIGN.md §8.1) is playable, decoupled from life-bar decay (that's M4).

**Build:** `career/camp.ts` — energy budget spent across training/weight-management/rest per week; `ui/screens/CampScreen.tsx`.

**Verify:** unit test — training allocation produces attribute gains gated by training-partner quality (stub a flat multiplier for now, real decay comes in M4); energy budget cannot go negative; a week always resolves to a new, valid fighter state.

**Exit artifact:** camp weeks advance fighter attributes in a bounded, testable way.

### Loop 3.3 — Matchmaking + procedural opponents

**Goal:** DESIGN.md §8.4 — opponents generated, not authored.

**Build:** `career/matchmaking.ts`, `content/names/*.json` (nationality-weighted pools, a handful of nationalities to start), opponent generation from archetype templates + ranking-scaled offer quality.

**Verify:** unit test — N generated opponents are all schema-valid `Fighter`s, archetype distribution roughly matches template weights, no duplicate names within a single generated slate at reasonable N.

**Exit artifact:** an infinite, valid opponent pool with no hand-authored roster.

### Loop 3.4 — Aftermath + ranking ladder

**Goal:** fight results feed back into career state.

**Build:** `career/progression.ts` — purse, hype, ranking update, injury application (basic version — full injury/life decay is M4) after each `simulateFight` call.

**Verify:** integration test — simulate a fight through the real engine, run aftermath, confirm ranking moves in the correct direction for a win vs a loss, purse is nonzero, injuries (if any) attach to `condition.injuries`.

**Exit artifact:** wins and losses have visible, correct career consequences.

### Loop 3.5 — Retirement + career card stub

**Goal:** the loop closes — a career can end.

**Build:** `progression.ts` retirement trigger (age/record/injury threshold — define explicitly), `ui/screens/CareerCardScreen.tsx` rendering record/finishes/grade from career state. Origin object is a stub here (real wrapper is M4) — hardcode a placeholder `Origin`.

**Verify:** manual playthrough — from a stubbed origin, play several camp/fight cycles via the fixture opponents, reach a retirement trigger, see a career card render with real accumulated stats.

**Exit artifact: M3 is done.** A full career loop (camp → fight → aftermath → retire) is playable start to finish with a stub origin, no life-bar decay yet, no amateur wrapper yet.

---

## Milestone M4 — Life layer + wrapper

*Reference: DESIGN.md §8.2 (camp-long side), §8.3, §9.*

### Loop 4.1 — Life bars + decay

**Goal:** DESIGN.md §8.3's neglect penalties are live.

**Build:** `career/life.ts` — training partners / partner / hype / sponsors / injury-wear bars, weekly decay from `balance.json`'s `weeklyDecay` block, penalties wired into `camp.ts`'s gain multipliers and `matchmaking.ts`'s offer quality.

**Verify:** unit test — a fighter with all bars neglected for N weeks shows measurably worse camp gains and worse matchmaking offers than one with bars fed, both starting from identical stats.

**Exit artifact:** the "permanently short of something" tension is measurable, not just narrated.

### Loop 4.2 — Weight cut as a camp-long resource

**Goal:** DESIGN.md §8.2's full system — diet/hydration management across camp weeks, resolving into the fight-week `cutPenalty` already built in Loop 1.6.

**Build:** extend `camp.ts` with diet/hydration state tracked weekly; extend `weightcut.ts`'s consumer (career layer, not the pure function) to compute cut quality from camp history and pass it into `simulateFight`'s tactics/modifiers.

**Verify:** unit test — a camp with poor hydration management across weeks produces a "botched" cut classification and measurably worse fight-week modifiers than a well-managed camp, using the existing Loop 1.6 penalty test as the base case.

**Exit artifact:** weight cut is a full strategic system, not a fight-week checkbox.

### Loop 4.3 — Amateur wrapper: the 6 moments

**Goal:** DESIGN.md §9.1's number-free montage, budget-conserving.

**Build:** `career/origin.ts`, `content/events/amateur.json` (6 moments × 2–3 options each), `ui/screens/ChargenWrapper.tsx`. Enforce budget conservation in the schema/loader: every option at a given moment sums to the same total points (validate this in the Zod schema or a boot-time check, not just by authoring discipline).

**Verify:**
- Automated check: every moment's options sum to equal totals (this should be a real assertion in content loading, not a manual author promise — DESIGN.md §9.1 calls it structural, so enforce it structurally).
- Manual playtest: complete the montage, confirm no live numbers are shown during it.

**Exit artifact:** a working, validated amateur wrapper.

### Loop 4.4 — Reveal screen + skip path

**Goal:** DESIGN.md §9.2's payoff and §9.3's fast path.

**Build:** `ui/screens/RevealScreen.tsx` (reuses `StatRadar` from Loop 2.2), skip-path RNG-driven `Origin` generator in `origin.ts` per §9.3.

**Verify:** manual check — full wrapper path and skip path both produce a valid `Origin` that the M3 pro-debut entry point (Loop 3.5, no longer stubbed) accepts without modification.

**Exit artifact:** wrapper and skip path both feed the same real entry point — the stub from Loop 3.5 is deleted.

### Loop 4.5 — Life event pool (~60 events)

**Goal:** DESIGN.md §12's hard content cap, templated for variety per §1 pillar 3.

**Build:** `career/events.ts` (deck draw + resolution), `content/events/life.json` — target ~60 events, built from a small number of templates with varied parameters rather than 60 fully bespoke entries.

**Verify:** content-loader test — all 60+ validate against schema; a lint/report script counts distinct templates vs total events to confirm templating (guard against silently drifting back into hand-authored volume).

**Exit artifact: M4 is done.** Full life-bar tension, full weight-cut system, complete amateur wrapper with skip path, ~60 events live.

---

## Milestone M5 — Daily prospect

*Reference: DESIGN.md §8.5, §11.*

### Loop 5.1 — Seeded daily run

**Goal:** everyone gets the same prospect + event deck on a given date.

**Build:** daily-seed derivation (`seedFromString(today's date)`) feeding both `origin.ts`'s skip-path generator and `events.ts`'s deck draw, so a full daily career is reproducible from the date alone.

**Verify:** test — same date string run twice produces byte-identical daily career setup (prospect stats, event deck order). Different date strings produce different setups.

**Exit artifact:** deterministic daily seeding proven.

### Loop 5.2 — Shareable result

**Goal:** DESIGN.md §8.5's Wordle-style shareable text, applied to the daily mode.

**Build:** career-card-to-text serializer (reuse Loop 3.5's career card data, add a compact text/emoji encoding), share button/copy-to-clipboard.

**Verify:** manual check — two different daily outcomes (e.g., a title win vs an early loss) produce visibly distinct, readable share text with no leaked implementation details (no raw JSON, no internal IDs).

**Exit artifact: M5 is done — v1 definition of done (DESIGN.md §14) is now fully met.**

---

## Cross-cutting loops (run continuously, not once)

These aren't milestone-gated — revisit them after every milestone closes.

- **Balance re-pass:** after any change to `balance.json` or engine logic, re-run `/lab` and re-check the M1 acceptance gates (DESIGN.md §10). Never hand-edit engine code to fix balance — only `balance.json`.
- **Purity audit:** after any `/engine` change, confirm the CI purity check (Loop 0) still passes — it's easy to accidentally reach for `Date.now()` for a "just this once" timestamp.
- **Memory audit:** after any change touching fight playback or persistence, re-check DESIGN.md §2's memory rules — full event logs discarded after playback, content frozen not cloned, no per-screen stores.
- **Determinism spot-check:** after any change to `fight.ts`/`round.ts`/`judging.ts`, re-run the Loop 1.7 determinism test before merging. This is the single most load-bearing test in the project.
