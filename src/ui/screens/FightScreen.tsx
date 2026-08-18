// FightScreen.tsx — Loop 2.1: replays a FightResult.events[] log at a
// controllable pace (DESIGN.md §6.7, §7). The fixture fighters + seed here
// match the Loop 1.7 determinism test (tests/fight.spec.ts) — a known-good,
// provably deterministic FightResult — since the career layer that will
// supply a real matchup doesn't exist until M3.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { computePillars, simulateFight } from '../../engine';
import { mulberry32 } from '../../engine/rng';
import type {
  Fighter,
  FightEvent,
  FightResult,
  MomentOverrides,
  MomentPerformance,
  Tactics,
  TacticId,
} from '../../engine/types';
import { archetypes, balance, judges } from '../../content';
import { PlayByPlay } from '../components/PlayByPlay';
import { FighterIdentity } from '../components/FighterIdentity';
import { Meter } from '../components/Meter';
import { Plate } from '../components/Plate';
import { Button } from '../components/Button';
import { StatRadar } from '../components/StatRadar';
import { TaleOfTheTape } from '../components/TaleOfTheTape';
import { Scorecard } from '../components/Scorecard';
import { CornerChoice } from '../components/CornerChoice';
import { MomentBar } from '../components/MomentBar';
import { Screen } from '../components/Screen';
import { Walkout, prefersReducedMotion } from '../components/Walkout';
import { faceFromSeed, serializeFaceCode } from '../portrait/faceCode';
import styles from './FightScreen.module.css';

const REVEAL_INTERVAL_MS = 220;
const FIXTURE_SEED = 2026;
const PILLAR_AXES = ['Striking', 'Grappling', 'Durability', 'Mind'] as const;

// Loop 6.3: these carried nationality: 'fixture', which rendered the neutral flag
// on the one screen where a fighter most needs to read as a person. The sentinel
// still resolves safely (§15.5), but a demo matchup with real names should carry
// the nationalities those names imply. Loop 7.16 deletes this fixture entirely,
// when the career starts supplying the real matchup.
function fighterFromArchetype(
  id: string,
  name: string,
  archetypeId: string,
  nationality: string,
  face: string,
): Fighter {
  const archetype = archetypes.find((entry) => entry.id === archetypeId);
  if (!archetype) throw new Error(`FightScreen fixture: missing archetype '${archetypeId}'`);
  return {
    id,
    name,
    nationality,
    face,
    weightClass: 'lightweight',
    stance: 'orthodox',
    attributes: { ...archetype.attributes },
    archetype: archetype.id,
    weakness: null,
    traits: [],
    condition: { health: 100, injuries: [] },
  };
}

// Faces drawn once at module load from a fixed, dedicated RNG stream — not
// FIXTURE_SEED, which seeds the fight simulation and must stay untouched or the
// Loop 1.7 determinism test this fixture matches would drift.
const fixtureFaceRng = mulberry32(424242);
const fighterA = fighterFromArchetype(
  'fighter-a', 'Riko Tanaka', 'striker', 'Japan',
  serializeFaceCode(faceFromSeed(fixtureFaceRng)),
);
const fighterB = fighterFromArchetype(
  'fighter-b', 'Deshawn Cole', 'wrestler', 'USA',
  serializeFaceCode(faceFromSeed(fixtureFaceRng)),
);
const emptyTactics: Tactics = {};

// Corner choices are precomputed into `tactics` (DESIGN.md §6.7 / Loop 2.3
// recommendation) rather than pausing the engine mid-sim. Re-running
// simulateFight from the same seed with an updated tactics map reproduces a
// byte-identical event prefix up to the round the choice was made, then
// diverges from there — so replaying it from revealCount 0 is safe and cheap.
//
// Why the prefix is stable: a round-N tactic is only read from round N
// onward, so every roll before round N sees identical inputs and draws the
// same values from the same seeded stream. Note this holds *per round*, not
// per tick — RNG consumption within a round is outcome-dependent (a landed
// strike draws extra values for the significant-strike and finish rolls),
// so a tactic that changes hit rates shifts the stream from that point on.
// Only ever extend `tactics` at rounds that haven't been revealed yet.
// Player moments (Loop 2.4) ride the same re-simulate mechanism: the engine
// resolves every moment itself (that IS the auto-resolve path), and playing
// one by hand adds a MomentOverrides entry and re-runs. RNG consumption per
// moment is constant, so an override changes the outcome without moving any
// later moment to a different exchange.
function buildResult(tactics: Tactics, momentOverrides: MomentOverrides): FightResult {
  return simulateFight(fighterA, fighterB, tactics, mulberry32(FIXTURE_SEED), momentOverrides);
}

function winnerName(result: FightResult): string {
  if (!result.winnerId) return 'No one';
  return result.winnerId === fighterA.id ? fighterA.name : fighterB.name;
}

interface HudState {
  healthA: number;
  healthB: number;
  staminaA: number;
  staminaB: number;
  rockedA: boolean;
  rockedB: boolean;
  roundsScored: number; // count of revealed roundEnd events
}

// Pure derivation from the revealed slice of the event log — the HUD never
// tracks its own running totals, so it can never drift from what's on
// screen in the play-by-play (DESIGN.md §2: UI replays the event log).
function deriveHudState(events: FightEvent[], revealCount: number, aId: string, bId: string): HudState {
  const state: HudState = {
    healthA: 100,
    healthB: 100,
    staminaA: 100,
    staminaB: 100,
    rockedA: false,
    rockedB: false,
    roundsScored: 0,
  };

  for (let i = 0; i < revealCount; i++) {
    const event = events[i];
    if (event.t === 'strike') {
      if (event.by === aId) state.healthB = Math.max(0, state.healthB - event.damage);
      else if (event.by === bId) state.healthA = Math.max(0, state.healthA - event.damage);
    } else if (event.t === 'knockdown') {
      if (event.who === aId) state.rockedA = true;
      else if (event.who === bId) state.rockedB = true;
    } else if (event.t === 'roundEnd') {
      state.staminaA = event.staminaA;
      state.staminaB = event.staminaB;
      state.roundsScored += 1;
    }
  }

  return state;
}

const emptyOverrides: MomentOverrides = {};

export function FightScreen() {
  // The walkout (§15.7) plays once per mount of this screen — i.e. once per
  // fight — never re-triggered by the corner-call/moment re-simulations
  // below, which only ever touch `result`. Skips itself immediately under
  // prefers-reduced-motion (Walkout.tsx), so the initial value already
  // matches "does not play at all" rather than "plays instantly".
  const [showWalkout, setShowWalkout] = useState(() => !prefersReducedMotion());

  const [tactics, setTactics] = useState<Tactics>(emptyTactics);
  const [momentOverrides, setMomentOverrides] = useState<MomentOverrides>(emptyOverrides);
  const [result, setResult] = useState<FightResult>(() => buildResult(emptyTactics, emptyOverrides));
  const [revealCount, setRevealCount] = useState(0);
  const [playing, setPlaying] = useState(true);
  // Moment indices the player has already answered (played or auto-resolved),
  // so a resolved moment doesn't re-prompt when playback continues past it.
  const [handledMoments, setHandledMoments] = useState<Record<number, true>>({});

  const frameRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const accumulatorRef = useRef(0);

  const done = revealCount >= result.events.length;

  // Pause playback right after revealing a roundEnd for any round before the
  // last, unless fighter A's corner has already picked a tactic for the
  // round that follows it.
  const pendingCornerRound = useMemo(() => {
    if (revealCount === 0 || revealCount > result.events.length) return null;
    const lastRevealed = result.events[revealCount - 1];
    if (lastRevealed?.t !== 'roundEnd') return null;
    if (lastRevealed.round >= balance.roundsPerFight) return null;
    const nextRound = lastRevealed.round + 1;
    if (tactics[fighterA.id]?.rounds[nextRound] !== undefined) return null;
    return nextRound;
  }, [result, revealCount, tactics]);

  // The next event to be revealed, if it's an unhandled player moment (§7).
  // Offered BEFORE it is revealed, since the outcome decides what follows it
  // in the log — the player is choosing, not reading back a result.
  const pendingMoment = useMemo(() => {
    const next = result.events[revealCount];
    if (next?.t !== 'playerMoment') return null;
    if (handledMoments[next.index]) return null;
    return next;
  }, [result, revealCount, handledMoments]);

  const hud = useMemo(
    () => deriveHudState(result.events, revealCount, fighterA.id, fighterB.id),
    [result, revealCount],
  );
  const pillarsA = useMemo(() => computePillars(fighterA.attributes), []);
  const pillarsB = useMemo(() => computePillars(fighterB.attributes), []);

  function chooseCornerTactic(tactic: TacticId) {
    if (pendingCornerRound === null) return;
    const nextTactics: Tactics = {
      ...tactics,
      [fighterA.id]: {
        cutQuality: tactics[fighterA.id]?.cutQuality ?? 'clean',
        rounds: { ...tactics[fighterA.id]?.rounds, [pendingCornerRound]: tactic },
      },
    };
    setTactics(nextTactics);
    // Same seed + an unchanged tactics prefix reproduces the already-revealed
    // events byte-for-byte (see buildResult) — safe to swap the result out
    // from under an in-progress reveal without rewinding what's on screen.
    setResult(buildResult(nextTactics, momentOverrides));
  }

  // A played moment contributes a performance (-1..+1) that tilts the
  // engine's roll for it, and the fight is re-simulated. Auto-resolve passes
  // performance 0 — identical to the unaided roll already in `result` — so
  // it needs no re-simulation at all (§7's "fair to skip").
  function resolveMoment(index: number, performance: MomentPerformance, played: boolean) {
    setHandledMoments((handled) => ({ ...handled, [index]: true }));
    if (!played || performance === 0) return;

    const nextOverrides: MomentOverrides = { ...momentOverrides, [index]: performance };
    setMomentOverrides(nextOverrides);
    setResult(buildResult(tactics, nextOverrides));
  }

  // Accepts the engine's outcome for every remaining moment and reveals the
  // rest of the fight. No override is recorded, so `result` already reflects
  // exactly these outcomes — nothing to re-simulate.
  function skipToEnd() {
    const handled: Record<number, true> = { ...handledMoments };
    for (const event of result.events) {
      if (event.t === 'playerMoment') handled[event.index] = true;
    }
    setHandledMoments(handled);
    setRevealCount(result.events.length);
  }

  // Index of the next unhandled moment, used to clamp batched reveals so a
  // slow frame can't skip past a moment the player must answer first.
  const nextMomentIndex = useMemo(() => {
    for (let i = revealCount; i < result.events.length; i++) {
      const event = result.events[i];
      if (event.t === 'playerMoment' && !handledMoments[event.index]) return i;
    }
    return -1;
  }, [result, revealCount, handledMoments]);

  useEffect(() => {
    if (showWalkout || !playing || done || pendingCornerRound !== null || pendingMoment !== null) return;

    function tick(ts: number) {
      if (lastTsRef.current === null) lastTsRef.current = ts;
      accumulatorRef.current += ts - lastTsRef.current;
      lastTsRef.current = ts;

      let revealed = 0;
      while (accumulatorRef.current >= REVEAL_INTERVAL_MS) {
        accumulatorRef.current -= REVEAL_INTERVAL_MS;
        revealed++;
      }
      if (revealed > 0) {
        // Never reveal past an unanswered moment, however long the frame was.
        const ceiling = nextMomentIndex === -1 ? result.events.length : nextMomentIndex;
        setRevealCount((count) => Math.min(ceiling, count + revealed));
      }
      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      lastTsRef.current = null;
    };
  }, [showWalkout, playing, done, pendingCornerRound, pendingMoment, nextMomentIndex, result.events.length]);

  const cornerOf: Record<string, 'red' | 'blue'> = {
    [fighterA.id]: 'red',
    [fighterB.id]: 'blue',
  };

  return (
    <Screen register="broadcast" id="fight-screen" eyebrow={`${fighterA.name} vs ${fighterB.name}`} title="Fight night" plate="cage">

      {showWalkout && (
        <Walkout
          fighterA={fighterA}
          fighterB={fighterB}
          pillarsA={pillarsA}
          pillarsB={pillarsB}
          onDone={() => setShowWalkout(false)}
        />
      )}

      <TaleOfTheTape fighterA={fighterA} fighterB={fighterB} pillarsA={pillarsA} pillarsB={pillarsB} />

      <Plate eyebrow="Attribute spread">
        <StatRadar
          axes={[...PILLAR_AXES]}
          series={[
            { name: fighterA.name, corner: 'red', values: [pillarsA.striking, pillarsA.grappling, pillarsA.durability, pillarsA.mind] },
            { name: fighterB.name, corner: 'blue', values: [pillarsB.striking, pillarsB.grappling, pillarsB.durability, pillarsB.mind] },
          ]}
        />
      </Plate>

      {/* §15.2: the player is always red, the opponent always blue. The corner
          class is set once per side here and every Meter under it inherits the
          fill — no component below takes a colour. */}
      <div class={styles.corners}>
        <div class="corner-red">
          <Plate eyebrow={hud.rockedA ? 'Hurt' : 'Red corner'} corner>
            <FighterIdentity fighter={fighterA} />
            <Meter label="Health" value={hud.healthA} tone={hud.rockedA ? 'warn' : 'default'} />
            <Meter label="Stamina" value={hud.staminaA} />
          </Plate>
        </div>
        <div class="corner-blue">
          <Plate eyebrow={hud.rockedB ? 'Hurt' : 'Blue corner'} corner>
            <FighterIdentity fighter={fighterB} />
            <Meter label="Health" value={hud.healthB} tone={hud.rockedB ? 'warn' : 'default'} />
            <Meter label="Stamina" value={hud.staminaB} />
          </Plate>
        </div>
      </div>

      <div class={styles.controls}>
        <Button
          variant="primary"
          onClick={() => setPlaying((p) => !p)}
          disabled={done || pendingCornerRound !== null || pendingMoment !== null}
        >
          {done ? 'Finished' : playing ? 'Pause' : 'Play'}
        </Button>
        {/* Skipping to the end auto-resolves every remaining moment: the
            result already holds the engine's own outcomes for any moment
            without an override, so this is the §7 skip path applied wholesale. */}
        <Button variant="ghost" onClick={skipToEnd} disabled={done}>
          Skip to end
        </Button>
      </div>

      {pendingCornerRound !== null && (
        <CornerChoice fighterName={fighterA.name} nextRound={pendingCornerRound} onChoose={chooseCornerTactic} />
      )}

      {pendingMoment !== null && (
        <MomentBar
          kind={pendingMoment.kind}
          onResolve={(performance, played) => resolveMoment(pendingMoment.index, performance, played)}
        />
      )}

      <PlayByPlay
        events={result.events}
        revealCount={revealCount}
        fighterNames={{ [fighterA.id]: fighterA.name, [fighterB.id]: fighterB.name }}
        cornerOf={cornerOf}
      />

      <Scorecard
        scorecards={result.scorecards}
        judges={judges}
        roundsScored={hud.roundsScored}
        fighterAName={fighterA.name}
        fighterBName={fighterB.name}
      />

      {done && (
        <Plate title={`${winnerName(result)} wins by ${result.method}`} eyebrow={`Round ${result.endRound}`} />
      )}
    </Screen>
  );
}
