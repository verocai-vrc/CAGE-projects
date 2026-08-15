# CAGE — MMA Career RPG

> A browser-hosted, single-player MMA career RPG in the spirit of *New Star Soccer*.
> Static. No backend. No accounts. Hosted on GitHub Pages.

---

## What it is

CAGE is a passion project: a light RPG where you build a fighter, balance a professional career against a decaying personal life, cut weight, and fight your way up a ranking ladder — one bounded, 20–40 minute run at a time.

It is not a simulation of any real promotion or roster. All fighters, gyms, promoters, and events are fictional.

---

## Core loop

```
Amateur wrapper (character creation disguised as a youth montage)
  ↓
Professional debut
  ↓  ←─────────────────────────────────────────────┐
Camp weeks (spend scarce energy across training,   │
            weight management, rest, life bars)    │
  ↓                                                │
Fight night (round-by-round simulation with        │
             corner decisions and player moments)  │
  ↓                                                │
Aftermath (purse, hype, ranking, injuries)         │
  ↓                                                │
Retirement card (record, grade, shareable text) ───┘
```

A career is a **run**, not a save-file contract. Losing persistence costs one session. Replays are fast; that is intentional.

---

## Design references

| Reference | What was borrowed |
|---|---|
| *New Star Soccer* | Scarce energy, decaying relationship bars, training vs life tension |
| mmafightsim.com | Four-pillar fight model, attribute-to-pillar compression, matchup-over-rating property |
| 7a0.com.br | Bounded run (7 matches), seeded daily challenge, shareable single-score result, blind "skip" mode |

---

## Key design decisions (locked)

- **Engine is pure.** `simulateFight(a, b, tactics, rng) => FightResult`. No DOM, no `Math.random`, no clock. UI replays the event log. This cannot be undone without rewriting the game.
- **Determinism everywhere.** One seeded RNG threaded explicitly through every roll. This unlocks the daily challenge, shareable seeds, replayable debugging, and automated balance testing.
- **The amateur wrapper is skippable.** First run: six formative moments (character creation disguised as a montage) resolve into a reveal screen (radar chart, archetype, weakness). Second run: auto-roll the origin and jump straight to a randomized pro debut — a harder, faster variant.
- **A small, capped set of interactive fight mechanics, reskinned.** A timing bar and a push-your-luck risk ladder, reused across every player-controlled moment via one shared component. Building three-plus minigames is how this project dies.
- **Balance by measurement.** A hidden `/lab` route runs 10,000 seeded simulations across archetype pairings and prints the win-rate matrix, finish distribution, and stamina-fade curves. All tunable constants live in `balance.json`. No balance change ships without re-running the lab.
- **Content is capped hard.** One weight class, ~20–30 procedurally generated opponents, ~60 life events. The engine is two weekends; a hand-authored content treadmill is six months.

---

## Tech stack

| | |
|---|---|
| Language | TypeScript (strict) |
| Build | Vite |
| UI | Preact (React API, ~3KB runtime — memory-adequate for a HUD text game) |
| State | Zustand (one store, sliced) |
| Styling | CSS Modules + design-token CSS custom properties |
| Content | JSON files validated by Zod at boot |
| RNG | Custom `mulberry32` (seedable, ~10 lines, no deps) |
| Persistence | `localStorage`, single versioned key, debounced writes |
| Tests | Vitest |
| Deploy | GitHub Actions → GitHub Pages |

No canvas, no game engine, no art pipeline for v1.

---

## Repository structure (abbreviated)

```
/src
  /engine      ← PURE. Never imports from /ui or /state.
  /career      ← Career-layer logic (camp, matchmaking, life bars, events)
  /content     ← JSON files (events, names, gyms, judges, archetypes)
  /state       ← Zustand store + localStorage persist
  /ui          ← Screens and components
  /lab         ← Hidden /lab route: batch simulation + balance report
```

The full architecture, data model, engine spec, and milestone plan are in [`DESIGN.md`](./DESIGN.md).

---

## Milestones

| # | Deliverable | Done when |
|---|---|---|
| M1 | Engine + lab | `simulateFight` is deterministic; matchup-over-rating property is provable in the lab |
| M2 | Fight viewer | Full round playback, corner decisions, player moments, scorecards |
| M3 | Career shell | Camp weeks, energy, matchmaking, ranking, retirement card |
| M4 | Life layer + wrapper | Decay bars, weight cut, amateur wrapper, reveal screen, skip path, first 60 events |
| M5 | Daily prospect | Seeded daily run + shareable result |

---

## Status

- [x] Concept and reference research
- [x] Loop and mechanics design
- [x] Architecture and data model specified (`DESIGN.md`)
- [x] M1 — Engine + lab
- [x] M2 — Fight viewer
- [x] M3 — Career shell
- [ ] M4 — Life layer + wrapper
- [ ] M5 — Daily prospect

---

## Legal

- No UFC trademarks. The promotion, its president, and all fighters are fictional.
- "Octagon" (Zuffa trademark) is not used. The arena has a different name.
- Procedurally generated opponents — no real athletes modelled.

---

## Notes (Obsidian)

- Related projects: [[Crisol]] (gamified life-tracker, same RPG-aesthetic sensibility; visual language may cross-pollinate)
- Stack overlap: Vite + TypeScript baseline is portable to Crisol's web layer if ever needed
- The seeded-RNG and balance-lab patterns are reusable in any future simulation project
- The "bounded run with a shareable career card" structure is a template worth keeping

---

*Working title: CAGE. Subject to change before any public release.*
