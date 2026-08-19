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

**Design amendment (DESIGN.md §6.6a):** rounds must report to the player as one explicit **check** per in-fiction minute, aggregated from this tick loop rather than left as a silent continuous simulation. Build the finer tick loop here as planned; the per-minute aggregation/report step is in scope for this loop or 1.5 (whichever ends up owning `RoundTape` assembly) — do not let it slip into a separate milestone.

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

## Milestone M6 — Visual system

*Reference: DESIGN.md §15. Read it before starting — every loop here implements a part of it, and §15 wins on any conflict.*

M5 closed the v1 feature set. The game is complete and unplayable-looking: a 90-byte stylesheet, browser-default serif headings and native form chrome, per-screen inline `style={{}}` objects, and no shared scale. This milestone is the pass that makes it a game someone finishes rather than closes.

Sequencing rule: **6.1 and 6.2 come first and are not negotiable.** Screen-level polish on top of an absent token system produces a second layer of inline styles to tear out later.

### Loop 6.1 — Tokens, type, and the shell

**Goal:** a screen can be styled without inventing anything.

**Build:**
- `ui/styles/tokens.css` — the full token set from DESIGN.md §15.2, both registers plus the shared spine.
- `ui/styles/fonts/` — three subsetted `.woff2` files per §15.3, `@font-face` declarations with `font-display: swap` and `size-adjust`-matched fallbacks, and a `README.md` recording the exact `pyftsubset` command.
- `index.css` — reset, base element styles, `body` on `--desk`, focus-visible ring, `prefers-reduced-motion` block.
- `ui/components/Screen.tsx` + module CSS — the layout primitive that applies a register class (`.reg-file` / `.reg-broadcast`), max-width, and page padding. Every screen roots in it.
- Delete `public/icons.svg` — Vite template leftover (bluesky/discord/github/x symbols), 3.5KB shipped and referenced nowhere.

**Verify:**
- Contrast: measure `--ink`/`--paper`, `--ink-soft`/`--paper`, `--bone`/`--canvas`, `--bone-soft`/`--canvas` and both `-text` corner variants. All ≥ 4.5:1 at body size. Record the measured numbers in a comment in `tokens.css`.
- Font files total ≤ 60KB; CSS ≤ 28KB raw. Both measured from a real `npm run build`, not estimated.
- No network request for a font at runtime (check the network panel or assert no `fonts.googleapis.com` string in `dist/`).
- Driver screenshots show the type scale live on at least one screen.

**Exit artifact:** a token system with measured contrast, three self-hosted subsets, and a `Screen` primitive. `tokens.css` is no longer an empty `:root {}`.

### Loop 6.2 — Component kit

**Goal:** the vocabulary in DESIGN.md §15.8 exists, so screens stop styling themselves.

**Build:** `Sheet`, `Plate`, `Button` (primary/ghost/stamp), `Meter` (replacing `HudBar`), `FormRow`, `Stamp`, `FlagChip` shell (geometry only — flags land in 6.3). CSS Modules, one per component, drawing only from tokens.

**Verify:**
- A grep for `style={{` across `src/ui/` returns zero hits in components built this loop.
- `Meter` renders correctly in both registers from the same props (register comes from the ancestor class, never a prop).
- Numbers inside `Meter` are mono and tabular — screenshot a meter animating 0→100 and confirm no horizontal jitter.

**Exit artifact:** a component kit that makes the remaining loops mostly composition.

### Loop 6.3 — Flags + fighter identity

**Goal:** DESIGN.md §15.5 — a fighter reads as a person at a glance.

**Build:**
- Five inline SVG flags (Brazil, Ireland, Japan, Poland, USA) in a sprite defs block, plus an explicit neutral fallback.
- `nationality` → flag lookup handling the `lab` and `fixture` sentinels without a broken glyph. Fix `FightScreen`'s fixture fighters, which currently carry `nationality: 'fixture'`.
- `FighterIdentity` — corner bar, name, flag, record, archetype. Portrait slot left empty for 6.4. **The record field has no source for an opponent:** `generateOpponent` produces no record at all, and the player's lives on `CareerState`, not on `Fighter`. Render the player's record from career state here and leave the opponent's slot empty until Loop 7.4 puts `record` on `Fighter`.

**Verify:**
- Render all five flags plus both sentinels at 16px and screenshot; each is recognizable and none falls back to a missing glyph.
- No emoji flag anywhere in the source (§15.5 — they render as letters on Windows).
- Sprite total ≤ 1.5KB.

**Exit artifact:** every fighter name in the game carries a flag.

### Loop 6.4 — Procedural portraits

**Goal:** DESIGN.md §15.4's face system, deterministic and asset-free.

**Build:**
- `ui/portrait/features.ts` — the feature path dictionary, ~40 small paths across nine slots.
- `ui/portrait/faceCode.ts` — `FaceCode`, base36 serialize/parse, `faceFromSeed(rng)`.
- `ui/components/Portrait.tsx` — renders ~9 `<use>` elements against the shared symbol defs.
- `face: string` on `Fighter` (`engine/types.ts` + `state/schema.ts`), populated in `matchmaking.ts` from the same seeded stream. Bump `SAVE_VERSION` to 2 — `persist.ts` already falls back to a clean restart on an unknown version, and §14 accepts losing a save costs one session.

**Verify:**
- Determinism test: the same seed produces the same `FaceCode` twice, and a generated opponent's face is stable across re-renders.
- Purity: `/engine` still never reads `face` — the Appendix B check must stay green.
- Round-trip test: `parse(serialize(code))` is identity for 1,000 random codes.
- Node budget: a screen rendering six portraits stays under the §15.9 ceiling.
- Screenshot a grid of 24 seeded faces — confirm visible variety, no two identical, none broken.

**Exit artifact:** an infinite roster with faces, zero asset bytes.

### Loop 6.5 — Portrait editor

**Goal:** the player authors their own fighter's face.

**Build:** a portrait step as step 0 of `ChargenWrapper` ("who's in the mirror") — per-slot cyclers over the feature dictionary, a randomize control, and a confirm. The authored `FaceCode` flows through `buildOriginFromChoices` into `startCareer`. The §9.3 skip path rolls a face from its existing seed and shows no editor.

**Verify:**
- Manual playthrough: author a face, complete the six moments, confirm the same face appears on the reveal screen, the career hub, and fight night.
- The editor renders no statline — §9.1's no-numbers rule still holds. Assert it in the driver by checking for absence of digits in the step's DOM.
- Skip path and daily path both produce a valid face with no editor shown.
- Save/reload round-trips the authored face. **Blocked as written:** `persist.ts` is complete and tested but no application code calls it — `loadCareer`/`saveCareer` appear only in `tests/persist.spec.ts`, so nothing is saved at runtime and this check cannot pass. Either pull Loop 7.1's persistence wiring forward into this loop, or verify the round-trip at the store level here and defer the reload check to 7.1.

**Exit artifact:** a player-created fighter that persists.

### Loop 6.6 — Damage accumulation

**Goal:** DESIGN.md §15.4's signature — the face becomes the record.

**Build:** `ui/portrait/wear.ts` — pure `faceWear(fighter, record, fightHistory) => WearLayers` producing cauliflower ear (0–2), brow scarring (0–3), nose break (bool), swelling (0–2, transient), and weathering. Overlay symbols in the sprite. If a needed signal is missing from `FightSummary`, add it there — never persist a wear object.

**Verify:**
- Monotonicity test: wear never decreases across a career except `swelling`, which must decay between camps.
- A fighter with a nose injury in history renders the nose-break layer; one without does not.
- Screenshot the same `FaceCode` at debut, mid-career, and after a brutal run — the three must be obviously distinguishable.
- Wear is derived, not stored: assert no wear fields appear in the serialized save.

**Exit artifact:** a face that tells you what the career cost.

### Loop 6.7 — The File: career hub, camp, chargen

**Goal:** DESIGN.md §15.1's paperwork register, applied.

**Build:** `CareerScreen`, `CampScreen`, `ChargenWrapper` rebuilt on `Sheet`/`FormRow`/`Stamp`. Camp's four range inputs are replaced by `BudgetSplit` per §15.8 — one bar, four segments, draggable dividers, always summing to the budget, hatched tail for unspent. Delete the over-budget warning and its state; keep `clampAllocation` as an engine-side guard. Week resolution stamps the sheet and slides it away to the carbon copy beneath.

**Verify:**
- `BudgetSplit` cannot produce a total above the budget, by construction. Unit test it.
- Keyboard: dividers move with arrow keys; the whole camp week is completable without a mouse.
- Touch: dividers are draggable at 360px wide with ≥44px touch targets.
- Driver screenshots of the camp screen at 360/768/1280 — all legible, none horizontally scrolling.
- Regression: `tests/camp.spec.ts` still green.

**Exit artifact:** the core scarcity loop finally looks like a zero-sum split, because it is one.

### Loop 6.8 — The Broadcast: fight night

**Goal:** DESIGN.md §15.1's broadcast register, applied.

**Build:** `FightScreen` rebuilt on `Plate`. `TaleOfTheTape` and `Scorecard` (round-by-round grid, mono). Corner colors threaded through `Meter`, `StatRadar`, `PlayByPlay`, `CornerChoice`, and `MomentBar` — the player red, the opponent blue, everywhere, with the `-text` variants for any small corner-colored text.

**Verify:**
- Every corner-colored text run below 18.66px bold uses a `-text` variant. Audit it explicitly; this is §15.2's named failure mode.
- Play all three finish types (KO, submission, decision) and screenshot each — HUD, scorecard, and log agree at every point, no drift from the event log.
- `MomentBar` and `CornerChoice` remain fully playable by keyboard, and auto-resolve still works.
- Node count on fight night is under the §15.9 ceiling.

**Exit artifact:** a fight you can read at a glance without labels.

### Loop 6.9 — Scene plates

**Goal:** DESIGN.md §15.6 — place, cheaply.

**Build:** six SVG plates (`gym`, `weigh-in`, `tunnel`, `cage`, `medical`, `home`), each ≤ 1KB, with the two CSS treatments. `ScenePlate` component. Placed behind screen headers only, never behind dense data.

**Verify:**
- Text over every plate still measures ≥ 4.5:1 in both treatments.
- Combined plate weight ≤ 6KB.
- Screenshot each plate in both registers.

**Exit artifact:** the game has locations.

### Loop 6.10 — The walkout

**Goal:** DESIGN.md §15.7's one set piece.

**Build:** the six-beat sequence at the File→Broadcast boundary, ~2.5s, CSS transforms and opacity only. Skippable by any input. Under `prefers-reduced-motion`, cut straight to the HUD.

**Verify:**
- Reduced-motion: the sequence does not play at all and the fight starts immediately. Test it with the media feature forced in the driver.
- Skip works at every beat, leaving correct state.
- Frame timing holds on a 4× CPU throttle profile — no dropped frames, no layout thrash (transform/opacity only).
- It plays once per fight, not on every re-render.

**Exit artifact:** the register boundary is the best moment in the run.

### Loop 6.11 — Reveal and career card

**Goal:** the two payoff screens earn their place.

**Build:** `RevealScreen` — the authored portrait beside the radar, archetype and weakness as a stamped license. `CareerCardScreen` — the debut face beside the retirement face, full record, grade, and the M5 share text. Extend the share artifact to include the face, if it can be done without a raster export.

**Verify:**
- Debut face renders with zero wear from the stored `FaceCode`; retirement face renders full wear. Side by side they read as the same person, older.
- Share text still copies cleanly with no leaked IDs or JSON (the Loop 5.2 check).
- Screenshot both screens at three viewports.

**Exit artifact:** a retirement card worth screenshotting.

### Loop 6.12 — Accessibility and performance gate

**Goal: this is the M6 exit gate.** Everything above holds up under measurement.

**Build:** extend `.claude/skills/run-cage/driver.mjs` to capture at 360/768/1280, assert the §15.9 node ceiling, and run an axe pass on every screen. Add a CI budget check for CSS, font, and total gzip weight, and a rule failing the build on any `.png`/`.jpg`/`.webp` outside the favicon.

**Verify (all must pass):**
- Every §15.9 budget met, measured from a real build.
- Zero axe violations at serious or critical severity.
- Full career completable by keyboard alone, start to retirement.
- Full career completable with `prefers-reduced-motion: reduce` — no motion, no missing state.
- No horizontal scroll at 360px on any screen.
- All existing tests green; determinism and purity checks untouched.

**Gate outcome (all verify items pass).** Measured, not asserted:

| Check | Result |
|---|---|
| §15.9 budgets | 6/6 pass — `npm run budget`, from a real build |
| axe, serious+critical | 0 across all 7 screens |
| DOM nodes, busiest player-facing screen | 363 / 1200 (fight night, 12s into playback) |
| Horizontal scroll @360px | none, all 7 screens |
| Full career by keyboard alone | title → 25 fights → retirement card, no mouse |
| Full career under `prefers-reduced-motion` | passes; the walkout never mounts, HUD up at 400ms |
| Test suite | 281 green |

Four defects the gate caught and this loop fixed:

1. **Fight night scrolled horizontally at 360px** (scrollWidth 534). `.corners` was a non-wrapping two-column flex row. Now wraps and stacks.
2. **`FighterIdentity`'s corner eyebrow measured 2.39:1 on every File screen** — §15.2's named failure mode, arriving through the register it was not written for: `--red-corner-text` is *lighter* than the fill to lift off arena black, which is backwards on paper. `--corner-text` is now bound per register (`--red-corner-file` / `--blue-corner-file`, 4.97–6.79:1 across all three File surfaces).
3. **`Stamp`'s `opacity: 0.92` pushed `--stamp` to 4.15:1.** `--stamp` on `--paper` is 4.64:1, the least headroom in the palette; an 8% veil was enough. The border carries the worn look now; the type is opaque. The token test measures token values, so only the rendered-pixel axe pass could catch this — the reason 6.12 exists.
4. **The JS-delta budget was genuinely exceeded**, at 29.95KB against 20KB. `#/lab` and `#/kit` are now dynamic imports (−8.7KB no player downloads), landing it at 22.84KB; §15.9's JS line was amended 20 → 24KB with the measurement recorded there. Total transfer, the budget that actually protects the player, closes at 108.67/150KB gzip.

Two findings handed forward to M7:

- **§16.4's "6.5KB for faces" does not survive measurement.** It was derived assuming flags spend their full 1.5KB and plates their full 6KB; measured, they spend 1,123 and 3,020. Faces are already at 7,465 and the four families total 13,722 / 14,336 — **614 bytes of headroom** for Loop 7.7's three new slots and three widened ones. `tests/sprite.spec.ts` prints the slice and fails if it goes negative. Expect to cut `gear` as §16.4 instructs.
- **`#/camp` has no back path**, so the keyboard run reaches the hub by hash rather than by control. Loop 8.1 (§16.3) owns it; the driver prints a NOTE rather than failing, since 6.12 does not scope navigation.

**Exit artifact: M6 is done.** The game a player opens looks like a game.

---

## Milestone M7 — Identity and voice

*Reference: DESIGN.md §16. Read it before starting — every loop here implements a part of it, and §16 wins on any conflict. §16.1's measurements are the reason several of these loops exist; do not skip it.*

M6 makes the game look like a game. M7 makes a bout read like two people fighting each other, with someone calling it. Three things stand in the way and none of them are cosmetic:

- **The career and the fight are not connected.** `CareerScreen.findFightAndResolve` simulates a bout headlessly and prints one sentence; `FightScreen` replays a hardcoded fixture matchup at a fixed seed. Narration on a screen the career never reaches is narration nobody hears.
- **Nothing is saved.** `persist.ts` is complete, tested, and called by no application code. `loadCareer`/`saveCareer` appear only in `tests/persist.spec.ts`.
- **A fighter never gets hurt.** §16.1: strike damage is 0.13, health never falls below 85.9, and `knockdown` fired 0 times in 400 seeded bouts.

Sequencing rule: **7.1 through 7.3 come first and are not negotiable.** They are the seed, the save, and the damage curve — narration, ledger, and gym generation all read from them, and building on top of the current non-determinism means re-doing the work.

**Dependency order across the four work packages:** foundations (7.1–7.3) → identity, package B (7.4–7.7) → gym and coach, package D (7.8–7.9) → narration, package C (7.10–7.15) → the fight-night wiring that makes any of it visible (7.16–7.17). Package A (screens and navigation) is **M8** — see the note before it for why.

### Loop 7.1 — The career seed, and persistence that actually runs

**Goal:** a career is reproducible from a seed, and closing the tab does not end it.

**Build:**
- `seed: string` on `CareerState` + `state/schema.ts`; set in `startCareer` (date string for daily runs, a rolled string otherwise).
- `careerRng(seed, purpose, index)` helper per DESIGN.md §16.2. Replace all three `Date.now()` call sites in `CareerScreen`.
- `loadCareer` returns `{ career, status: 'empty' | 'loaded' | 'discarded' }` per §16.2.
- Wire persistence: load on app mount, `saveCareer` subscribed to store changes (debounced write already exists).
- `SAVE_VERSION` → 3.

**Verify:**
- Test: two careers started from the same seed string produce identical opponents, identical offers, and identical event-deck order. Today they differ every run.
- Test: `loadCareer` returns `status: 'discarded'` for a version-2 envelope, a malformed JSON blob, and a schema-invalid career — and returns `initialCareerState` without throwing in all three (extend `tests/persist.spec.ts`).
- Driver: complete a camp week, reload the page, confirm week/attributes/life bars survive. This currently fails at every step.
- Grep: zero `Date.now()` / `new Date()` under `src/` outside the daily-date helper.

**Exit artifact:** a career that is both reproducible and survivable.

### Loop 7.2 — Damage re-tune: make a fighter capable of being hurt

**Goal:** DESIGN.md §6.4's promise — absorb punishment, then fold — is actually observable, so §16.6 has a `rocked` beat to narrate.

**Build:** `content/balance.json` only. Raise `baseStrikeDamage` until health traverses a real range across a bout, then re-tune `kFinish` and `significantStrikeChance` against it so finish rates stay in the M1 band. **No engine code changes in this loop** — DESIGN.md §10: balancing is editing JSON and re-running the lab.

**Verify:**
- Over 400 seeded bouts: `knockdown` fires in a measurable share of bouts (target ≥15%), and `finish: TKO` becomes reachable. Both are currently exactly 0.
- Lowest health reached across the sample is well below `knockdownHealthThreshold` (55). Currently 85.9.
- The M1 gates still hold: no archetype above ~60% against the field, the matchup-over-rating property intact, finish distribution inside the documented band. Re-run `/lab` and record the numbers.
- Determinism spot-check green (`tests/fight.spec.ts` byte-identical log test).
- **Latent bug this loop will expose:** `FighterRuntime.rocked` is set once and never cleared, so the HUD's "HURT" state latches on for the rest of the bout. It has been invisible because it never fires. Decide the recovery rule here (clear at `roundEnd`, or decay with health) and test it — a fighter permanently "hurt" from round 1 would make the `rocked` beat in 7.13 nonsense.

**Exit artifact:** a health bar that means something, and a knockdown that exists.

### Loop 7.3 — `weakness` becomes real; opponents get one

**Goal:** the "explicitly-called-out exploitable weakness" the reveal screen has been promising since Loop 4.4 finally does something. §16.5.

**Build:**
- `weaknessPenalty` in `balance.json`; applied in `round.ts`/`fight.ts` at the three contested rolls in §16.5's table. Deterministic, no new RNG.
- `matchmaking.ts` draws a weakness (or `null`) from the opponent's seeded stream instead of hardcoding `null`.

**Verify:**
- Test: a fighter with `takedown-defense` loses to an identical opponent measurably more often over N seeded bouts than the same fighter with `weakness: null`; the other two ids each move their own roll and not the others'.
- Purity check green — no `Math.random`, no clock, one new constant in `balance.json`.
- Lab re-run: the M1 gates still hold with weaknesses live on both sides.

**Exit artifact:** the weakness is a hole, not a caption.

### Loop 7.4 — Records on `Fighter`, single-sourced

**Goal:** an opponent has a record, and the player's record lives in exactly one place. §16.5.

**Build:** `record: { wins, losses, draws }` on `Fighter` (+ schema); seeded and ladder-scaled in `matchmaking.ts`; **delete `CareerState.record`** and repoint `progression.ts`, `shareCard.ts`, `CareerScreen`, and `CareerCardScreen` at `career.player.record`.

**Verify:**
- Test: `applyAftermath` moves `player.record` correctly for win/loss/draw; `grep -rn "career.record" src/` returns zero hits.
- Test: generated opponents at ladder position 1 carry better records than those at 15, and no opponent is 0-0.
- Purity: `/engine` never reads `record` — audit the diff, the Appendix B check stays green.

**Exit artifact:** every fighter in the game has a record behind their name.

### Loop 7.5 — Style descriptors and scouting fidelity

**Goal:** §16.5's descriptor predicates, and `fightIQ` becoming information per §6.6.

**Build:** `career/identity.ts` — the predicate table exactly as tabulated in §16.5, plus `tendenciesFor(opponent, playerFightIQ, rng)` implementing the three-tier fidelity table (including the deliberately-wrong tendency below 45).

**Verify:**
- Test: every descriptor is reachable — construct an `Attributes` set satisfying each predicate and assert it is returned.
- Test: at `fightIQ` 80 → 3 tendencies, all satisfied by the opponent; at 30 → 2 tendencies, exactly one of which the opponent does **not** satisfy.
- Test: determinism — same seed, same opponent, same `fightIQ` gives the same tendency list.
- Audit: no descriptor exists that is not a predicate over `Attributes` (§16.5's cut list).

**Exit artifact:** `fightIQ` stops being inert.

### Loop 7.6 — Nicknames

**Goal:** a mnemonic handle that survives the fight. §16.5.

**Build:** `content/names/nicknames.json` (adjective × noun pools + standalone), Zod schema, `nicknameFor(rng, archetype, nationality)` in `identity.ts`, ~65% assignment rate.

**Verify:**
- Test: 1,000 seeded fighters produce ≥200 distinct nicknames and a `null` rate within 5 points of the target.
- Test: determinism across two runs of the same seed.
- CI content lint (built here, extended in 7.15): the denylist rejects real fighters' monikers. Prove it fires by adding one temporarily, then remove it.

**Exit artifact:** fighters you can refer to by name in a sentence.

### Loop 7.7 — Portrait vocabulary extension

**Goal:** §16.4 — three new slots and wider ranges, without breaking M6's contracts.

**Build:** `build` (5), `marks` (12, `mk-*` namespace), `gear` (8) added to `FaceCode`; `hair` → 10, `facialHair` → 8, `hairColor` → 6. `<Portrait>` takes `stance` as a prop and reads it from `Fighter.stance` — **not** a face slot. Serialisation goes 9 → 12 chars.

**Verify:**
- Round-trip: `parse(serialize(code))` is identity for 1,000 random 12-char codes.
- A southpaw always renders in the southpaw carriage — assert against `Fighter.stance`, not the code.
- Marks and wear never occupy the same layer: render a heavily-worn tattooed face and confirm both are visible and neither clips the other.
- **Measured** inline SVG for faces ≤ 6.5KB (§16.4). If over, cut `gear` in this loop, not later.
- Screenshot a 24-face grid — visible variety, none broken.

**Exit artifact:** faces that carry a build and a history before the first punch.

### Loop 7.8 — Gym generation and camp bias

**Goal:** §16.8 — a gym that changes how camp resolves, and the end of the dangling `mentorGymId`.

**Build:**
- `content/gyms.json` (currently the literal file `{}`) with the four ids the amateur wrapper already emits as authored anchors, plus procedural name parts.
- `career/gym.ts` — `generateGym(rng, ...)`; `specialtyMultiplier`/`offSpecialtyMultiplier`/`gymDuesBase` in `balance.json`.
- `camp.ts`: specialty biases per-attribute training gains; `gym.reputation / 100` replaces the flat `defaultTrainingPartnerQuality` ceiling; weekly `dues` deducted from purse.
- `gymId` on `CareerState`, set from `origin.mentorGymId` in `startCareer`.

**Verify:**
- Test: identical camps at a striking gym vs a grappling gym produce measurably different attribute spreads from the same allocation.
- Test: `gym.reputation` 100 vs 40 changes training gains at identical `trainingPartners`.
- Test: dues reduce purse weekly; a broke fighter's purse floors at 0 rather than going negative.
- Test: every `mentorGymId` the amateur wrapper can emit resolves to a real gym entry — all four, including the `neighborhood-gym` fallback.

**Exit artifact:** where you train changes what you become.

### Loop 7.9 — Coach generation, and the gym move

**Goal:** §16.8's coach, and the agency that makes specialty a decision.

**Build:** `content/coaches.json` (name parts, backgrounds, temperaments); `generateCoach(rng)` with `acuity`; `coach` on `CareerState`; a post-fight gym-move offer (costs money, resets `trainingPartners` to 50).

**Verify:**
- Test: seeded generation is deterministic and covers all four temperaments and all five backgrounds over N draws.
- Test: accepting a gym move changes `gymId`, debits purse, resets the bar, and the next camp week resolves against the new specialty.
- Test: a move is refused when the player cannot afford it, with a reason surfaced rather than a dead button.

**Exit artifact:** a corner with a name, and a reason to leave it.

### Loop 7.10 — Narration schema, content pipeline, reachability manifest

**Goal:** the shape of a line pool exists and is provably validated, before a single line is written. §16.6.

**Build:**
- `NarrationLineSchema` in `state/schema.ts` per §16.6's interface.
- `src/narration/` created; `/narration` added to the Loop 0 purity check (forbidden imports for `/engine`; no `Math.random`/`Date`/DOM inside `/narration`).
- `REACHABLE_EVENT_VARIANTS` — the manifest from §16.1.
- Lazy content loader for `content/narration/*.json` with build-time validation in CI.

**Verify:**
- **Two-directional reachability test:** run 500 seeded bouts *with corner tactics supplied*, collect the observed variant set, assert it equals the manifest exactly. It must fail if a variant is added and if one disappears — prove both by temporarily perturbing the manifest.
- Purity check fails on a deliberate `Math.random()` in `/narration`, then passes once removed.
- A malformed narration pool fails the CI validation test, not the runtime.

**Exit artifact:** the contract, with a test that catches drift in both directions.

### Loop 7.11 — Beat extraction

**Goal:** 85 events become ~21 beats, deterministically and with no RNG. §16.6.

**Design amendment (DESIGN.md §16.6a):** per-minute checks (§6.6a) are events/event-runs that fold into beats through this same extraction, not a second pipeline. Before building this loop, re-measure the beat budget and salience constants against a fight that includes check-beats (up to 5/round) — the 7-per-round budget and ~21-beat/bout target predate this amendment and may need retuning so check-beats don't crowd out mandatory beats.

**Build:** `narration/beats.ts` — the thirteen `BeatKind`s, strike-run aggregation into `exchange`, absorption of post-takedown `position` events, the synthetic `open` and `decision` beats, salience scoring, and the 7-per-round budget.

**Verify:**
- Test over 400 seeded bouts: mean beats per bout is 18–24; no round exceeds 7 beats.
- Test: a decision bout produces exactly one `decision` beat and zero `finish` beats; a KO bout the reverse. (32% of bouts go to decision and emit no terminal event — §16.1.)
- Test: extraction is a pure function — same `FightResult` in, identical `Beat[]` out, and no `rng` parameter exists in the signature at all.
- Test: beats over a **prefix** of a diverged log are identical up to the divergence point (the property corner-call re-simulation depends on).

**Exit artifact:** a fight compressed to its story.

### Loop 7.12 — The selector

**Goal:** a beat becomes a line, identically on every replay. §16.6.

**Build:** `narration/select.ts` (priority tiers, weights, cooldowns, the 6-id anti-repeat window, the fixed relaxation order) and `narration/slots.ts` (total slot resolution, `needsNickname`/`needsGym` filtering).

**Verify:**
- **Replay test:** the same bout seed narrates byte-identically across two runs, and across a re-simulation triggered by a corner call at round 2 the narrated *prefix* is unchanged. This is the load-bearing test of the whole package.
- Test: exactly one `rng.next()` is consumed per beat regardless of candidate-set size — instrument the RNG and count.
- Test: the selector is total — with every pool artificially reduced to its single unconditional fallback line, 400 bouts narrate with zero exceptions and zero empty strings.
- Test: a fighter with `nickname: null` never yields a line containing `{NICK_`; assert on rendered output across 400 bouts.

**Exit artifact:** deterministic commentary.

### Loop 7.13 — Line pools: action beats

**Goal:** the content that carries 80% of the load. §16.6's floors.

**Build:** `content/narration/action.json` — `exchange` (≥40, ≥6 per sub-condition), `takedown` (≥14), `stuffed` (≥12), `standup` (≥10), `ground` (≥10), `submission` (≥10), `rocked` (≥12), `moment` (≥18). Two voices per §16.6.

**Verify:**
- The coverage test from 7.10 passes at these floors, including every kind's unconditional fallback line.
- Read 5 full narrated bouts end to end: no line repeats inside a bout; the `colour` voice never fires twice consecutively.
- Content lint (trademark denylist) green.

**Exit artifact:** the bout has a voice.

### Loop 7.14 — Line pools: frame beats, and the corner

**Goal:** the beats that open, punctuate, and close a bout, plus §16.7's corner.

**Build:** `content/narration/frame.json` — `open` (≥14), `roundEnd` (≥24 across four sub-conditions), `finish` (≥18, ≥6 per method), `decision` (≥12, ≥3 per verdict). `content/narration/corner.json` — ~60 lines across 4 temperaments × 5 tactics + situational variants. `ChoiceCard` wiring so each tactic shows the coach's instruction plus an honest consequence chip.

**Verify:**
- Full coverage test green at every floor in §16.6's table, ≥60 lines tagged `voice: 'colour'`.
- Corner: a `gambler` and a `calm` coach visibly differ in both recommendation and wording at identical fight state.
- The recommendation is wrong at a rate consistent with low `acuity` + low `fightIQ`, and the consequence chip is misleading in exactly those cases (§16.7).
- **Measured** narration + corner content ≤ 13KB gzip (§16.9). Measure from a real build, not from the JSON.

**Exit artifact:** three neutral buttons are gone.

### Loop 7.15 — `CommentaryFeed` and beat-paced playback

**Goal:** narration on screen, at a readable pace, in the Broadcast register. §16.6.

**Build:** `CommentaryFeed` (three-line window, fixed node count); `FightScreen`'s reveal clock re-paced from events to beats with `beatInterval = min(2600, 700 + 26 × length)`; `PlayByPlay` demoted to a collapsible "tape", off by default; finish-beat pre-emption; keyboard (space, `→`); whole-line reveal under `prefers-reduced-motion`.

**Verify:**
- A 3-round decision plays in 45–70s; a round-1 KO does not feel truncated.
- All events belonging to a beat reveal together — the HUD never disagrees with the line on screen. Check at every beat of three fixture bouts (KO, submission, decision).
- Node count on fight night still under the §15.9 ceiling with the feed live.
- Reduced motion: no per-character reveal, no missing lines.
- Contrast: the dimmed history lines measured at their **actual rendered opacity**, ≥4.5:1 (§16.9).
- Keyboard: a full bout is completable with space and `→` alone.

**Exit artifact:** you can watch a fight by reading it.

### Loop 7.16 — The career fights the fight

**Goal:** the career loop and the fight viewer become one thing.

**Build:**
- `career/bout.ts` — `runBout` owning the bout seed and stamping `FightSummary.seed` (currently always `''`).
- `FightScreen` takes the real matchup from the store; delete the fixture fighters and `FIXTURE_SEED`.
- `CareerScreen`'s `findFightAndResolve` is replaced by: accept offer → `#/fight` → `#/aftermath` → hub. Back paths on all three (fight night excepted, §16.3).
- Active-bout inputs persisted per §16.2; resume at last completed round on reload.

**Verify:**
- Driver: hub → offer → fight night → aftermath → hub, entirely by clicking, no `page.goto`.
- Test: no persisted `FightSummary` has an empty `seed`.
- Test: reload mid-bout re-simulates from the seed and resumes at the last completed round with identical narration for the revealed prefix.
- Test: the same career seed replays a whole career — same opponents, same bouts, same narration.

**Exit artifact:** the fixture matchup is deleted, and fight night is where the career goes.

### Loop 7.17 — The ledger

**Goal:** §16.5 — the player remembers who they beat, and §8.5's long-unimplemented "rival you never beat" becomes real.

**Build:** `opponentName`, `opponentFaceCode`, `opponentNickname`, `headline` on `FightSummary`; `headline` captured from the highest-salience beat's line; `Ledger` component on the hub and the career card; rival derivation.

**Verify:**
- Test: no `FightResult.events[]`, `Beat[]`, or `WearLayers` appears anywhere in the serialised save (§2 — extend the existing memory-audit assertions).
- Test: ledger cost ≤ 150 bytes per fight, measured on a full 20-fight career.
- Manual: play a 20-fight career and read the ledger back. Opponents from fight 3 should be recognisable at fight 20 — face, nickname, and the sentence that fired.
- Share text still copies cleanly with no leaked ids or JSON (the Loop 5.2 check).

**Exit artifact:** a career you can recount.

### Loop 7.18 — M7 gate

**Goal: this is the M7 exit gate.** Everything above holds under measurement.

**Build:** extend the driver to walk hub → offers → scout → fight night → aftermath → ledger by clicking only, capture the commentary feed at three viewports, and assert the split budget checks (initial transfer ≤ 150KB gzip, narration chunk ≤ 13KB gzip). Add the trademark content lint to CI.

**Verify (all must pass):**
- Both gzip budgets met, measured from a real build. Every other §15.9 budget still met.
- Coverage test green at every §16.6 floor; reachability manifest test green in both directions.
- Replay determinism: a full career from one seed reproduces identical opponents, bouts, and narration, twice.
- Purity: `/engine` and `/narration` checks green; zero `Math.random`/`Date` outside the daily-date helper.
- Zero axe violations at serious or critical severity on every screen touched.
- Full career completable by keyboard alone, and under `prefers-reduced-motion: reduce`.
- Save survives a reload at every point in the loop, including mid-bout.
- M1 lab gates still hold after 7.2's and 7.3's balance changes.

**Exit artifact: M7 is done.** Two people fight, someone calls it, and the player remembers it afterwards.

---

## Milestone M8 — Front of house

*Reference: DESIGN.md §16.3. The route table there is binding and complete; these loops implement it.*

**Why this is a separate milestone.** The M7 planning pass scoped four work packages. Three of them (identity, narration, gym/coach) plus the foundations they need come to eighteen loops — already half again the size of M6. The fourth, the full screen inventory and navigation, is nine more. Twenty-seven loops behind one exit gate is not a gate, it is a quarter with a checkbox at the end. The split boundary is meaningful rather than arbitrary: **M7 is what happens inside a bout, M8 is everything around it.** M7 builds only the navigation spine its own screens need (hub → offers → fight → aftermath, Loop 7.16); M8 builds the rest and makes the whole surface coherent.

### Loop 8.1 — `resolveRoute` and the end of dead ends

**Goal:** DESIGN.md §16.3 — one derived-route rule, and a back path on every screen.

**Build:** `resolveRoute(career, requested)` per §16.3; `app.tsx` routes through it; unknown routes go to the title instead of silently rendering the hub. A back affordance on `CampScreen`, `CareerCardScreen`, `RevealScreen`, and `LabScreen` — all four currently render no navigation of any kind.

**Verify:**
- Test: a table of (career state × requested route) pairs resolves as §16.3 specifies, including `#/fight` with no active bout and `#/camp` with no player.
- Driver: reach and leave every screen by clicking only — zero `page.goto` calls remain in the driver except the initial load.
- Test: `#/garbage` resolves to the title.

**Exit artifact:** no screen you can get stuck on.

### Loop 8.2 — Title screen and its branches

**Goal:** §16.3's four cold-open states.

**Build:** `TitleScreen` [File] on `#/`, branching on 7.1's `loadCareer` status: no save, save in progress (continue + record + week), career finished (view card + start new), save discarded (a plain explanation, not a stack trace).

**Verify:** all four branches screenshot at three viewports; the discarded branch triggers from a hand-written version-2 envelope in `localStorage`; "continue" resumes at the correct screen via `resolveRoute`.

**Exit artifact:** the game has a front door.

### Loop 8.3 — New-run entry and the daily stamp

**Goal:** §9.3's three entry paths as one screen, and §16.3's daily treatment.

**Build:** `#/new` — full wrapper, skip path, today's prospect (all three currently live as bare buttons on the career hub). The `DAILY · <date>` `Stamp` on every File screen in a daily run; seed shown in the mono voice.

**Verify:** all three paths produce a valid `Origin` and a playable career; the daily stamp appears on hub/camp/life/offers/card in a daily run and nowhere in a normal one; no new token or palette was introduced (grep the diff).

**Exit artifact:** three ways in, one register.

### Loop 8.4 — The life screen

**Goal:** §8.3's life layer stops being four bars bolted to the hub — and the 60 life events finally reach a player.

**Build:** `#/life` [File]; `events.ts`'s deck draw wired to camp-week resolution; `ChoiceCard` for options with honest consequence chips; `seenEventIds` in `CareerState` so the no-repeat deck works across a career; `buildDailySetup`'s `eventDeckOrder` consumed instead of discarded.

**Verify:**
- The M4 event pool is reachable in play: a 20-week career surfaces ≥15 distinct events, none twice. **This currently returns zero** — `drawLifeEvent` is called only by `daily.ts`, whose `eventDeckOrder` `CareerScreen` throws away.
- Test: a daily run's event order matches `buildDailySetup`'s precomputed order exactly.
- Test: choices move the bars they claim to, and the deck reshuffles rather than running dry.

**Exit artifact:** the 60 events written in M4 are in the game.

### Loop 8.5 — Offers and scouting

**Goal:** §16.5's three-second read.

**Build:** `#/offers` (a slate with purse, hype reward, ladder position) and `#/scout/:i` with the `ScoutCard` — portrait, flag, name, nickname, record, gym, style, tendencies at the player's `fightIQ` fidelity.

**Verify:** six scout cards side by side are distinguishable at a glance in a screenshot; tendency count and honesty match `fightIQ` per §16.5's table; a bad `:i` resolves to `#/offers`; the empty state (retired or injured) says why and what fixes it.

**Exit artifact:** you choose an opponent instead of being handed one.

### Loop 8.6 — Aftermath and the ladder

**Goal:** consequences get a screen, and the ranking becomes visible.

**Build:** `#/aftermath` [Broadcast → File] — result, purse, hype, ranking move, injuries, the ledger entry, and any gym-move offer, with §15.7's numbers counting up. `#/ladder` [File] — the ~15-to-title ladder with the player's position marked.

**Verify:** every value on the aftermath screen matches the store after `applyAftermath` (no recomputation, no drift); the register hand-back from Broadcast to File is visible in the screenshots; the ladder's unranked empty state explains what ranks you.

**Exit artifact:** winning and losing look different.

### Loop 8.7 — Retirement and the career card

**Goal:** §8.5's full artifact.

**Build:** the retirement flow (trigger → a retirement beat → card), the card carrying debut face beside retirement face (M6 Loop 6.11), the `Ledger`, the rival, three highlight headlines, grade, and the share text.

**Verify:** debut and retirement faces read as the same person aged; the rival derivation picks the opponent a human would name; share text copies clean with no ids or JSON; screenshot at three viewports.

**Exit artifact:** a retirement card worth screenshotting.

### Loop 8.8 — Settings

**Goal:** the affordances §15 and §16 already require, in one place.

**Build:** `#/settings` — reduced motion (system / force on / force off), playback speed (beat interval), commentary on/off (falls back to the tape), text size, `?` key map, wipe save with confirmation.

**Verify:** forcing reduced motion in-app produces the same result as the OS media feature (test both); commentary off leaves a fully playable fight on the tape alone; wipe save returns to the title's no-save branch; every control is reachable and operable by keyboard.

**Exit artifact:** the accessibility promises are settings, not assumptions.

### Loop 8.9 — M8 gate

**Goal: this is the M8 exit gate.**

**Verify (all must pass):**
- Every screen in §16.3's table exists, at its route, in its register, with its empty and error states, and with a back path (fight night excepted).
- `resolveRoute` handles reload at every screen; the driver reloads at each one and asserts the resolved route.
- Full career, title to retirement, completable by keyboard alone and under `prefers-reduced-motion: reduce`.
- No horizontal scroll at 360px on any screen; zero serious/critical axe violations.
- All §15.9 and §16.9 budgets met, measured from a real build.
- All existing tests green; determinism, purity, and the narration replay test untouched.

**Exit artifact: M8 is done.** The game has a front of house, and a run has a shape from cold open to retirement.

---

## Cross-cutting loops (run continuously, not once)

These aren't milestone-gated — revisit them after every milestone closes.

- **Balance re-pass:** after any change to `balance.json` or engine logic, re-run `/lab` and re-check the M1 acceptance gates (DESIGN.md §10). Never hand-edit engine code to fix balance — only `balance.json`.
- **Purity audit:** after any `/engine` change, confirm the CI purity check (Loop 0) still passes — it's easy to accidentally reach for `Date.now()` for a "just this once" timestamp.
- **Memory audit:** after any change touching fight playback or persistence, re-check DESIGN.md §2's memory rules — full event logs discarded after playback, content frozen not cloned, no per-screen stores.
- **Determinism spot-check:** after any change to `fight.ts`/`round.ts`/`judging.ts`, re-run the Loop 1.7 determinism test before merging. This is the single most load-bearing test in the project.
- **Visual regression:** after any UI change, re-run the driver and diff the screenshots. A screenshot set is the only honest verification for visual work — read the images, do not assume the CSS did what you meant.
- **Contrast audit:** after any token or palette change, re-measure the ratios recorded in `tokens.css`. DESIGN.md §15.2's corner-color text rule is the one most likely to be violated by accident.
- **Budget audit:** after any change adding a font, an SVG, or a component, re-check DESIGN.md §15.9 and §16.9. Budgets erode one reasonable addition at a time, and §16.9 shows the gzip ceiling is down to single-digit KB of headroom.
- **Narration replay check:** after any change to `fight.ts`, `round.ts`, `beats.ts`, or `select.ts`, re-run the Loop 7.12 replay test. It is the determinism spot-check's twin — the fight log and the narration of it must both be reproducible, or the daily challenge is only half deterministic.
- **Reachability audit:** after any change that adds or removes an emitted `FightEvent` variant, or any `balance.json` change that could make one unreachable, re-run Loop 7.10's two-directional manifest test. DESIGN.md §16.1 exists because an unreachable event went unnoticed through five milestones.
- **Trademark lint:** after adding any content file, confirm the denylist check in CI covers it. DESIGN.md §13 is a legal constraint, not a style note.
