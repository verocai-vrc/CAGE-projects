// FightScreen.tsx — Loop 2.1: replays a FightResult.events[] log at a
// controllable pace (DESIGN.md §6.7, §7). The fixture fighters + seed here
// match the Loop 1.7 determinism test (tests/fight.spec.ts) — a known-good,
// provably deterministic FightResult — since the career layer that will
// supply a real matchup doesn't exist until M3.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { computePillars, simulateFight } from '../../engine';
import { mulberry32 } from '../../engine/rng';
import type { Fighter, FightEvent, FightResult, Tactics } from '../../engine/types';
import { archetypes, judges } from '../../content';
import { PlayByPlay } from '../components/PlayByPlay';
import { HudBar } from '../components/HudBar';
import { StatRadar } from '../components/StatRadar';

const REVEAL_INTERVAL_MS = 220;
const FIXTURE_SEED = 2026;
const PILLAR_AXES = ['Striking', 'Grappling', 'Durability', 'Mind'] as const;

function fighterFromArchetype(id: string, name: string, archetypeId: string): Fighter {
  const archetype = archetypes.find((entry) => entry.id === archetypeId);
  if (!archetype) throw new Error(`FightScreen fixture: missing archetype '${archetypeId}'`);
  return {
    id,
    name,
    nationality: 'fixture',
    weightClass: 'lightweight',
    stance: 'orthodox',
    attributes: { ...archetype.attributes },
    archetype: archetype.id,
    weakness: null,
    traits: [],
    condition: { health: 100, injuries: [] },
  };
}

const fighterA = fighterFromArchetype('fighter-a', 'Riko Tanaka', 'striker');
const fighterB = fighterFromArchetype('fighter-b', 'Deshawn Cole', 'wrestler');
const emptyTactics: Tactics = {};

function buildFixtureResult(): FightResult {
  return simulateFight(fighterA, fighterB, emptyTactics, mulberry32(FIXTURE_SEED));
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

// Running scorecard totals: scorecards are computed in full up front (same
// as events — simulateFight returns the whole result synchronously), so
// "revealing" them progressively just means summing the rounds whose
// roundEnd event has appeared on screen so far.
function runningScorecardTotals(result: FightResult, roundsScored: number) {
  return result.scorecards.map((sc) => {
    const scored = sc.roundScores.slice(0, roundsScored);
    const total = scored.reduce((acc, r) => ({ a: acc.a + r.a, b: acc.b + r.b }), { a: 0, b: 0 });
    return { judgeId: sc.judgeId, ...total };
  });
}

export function FightScreen() {
  const [result] = useState<FightResult>(buildFixtureResult);
  const [revealCount, setRevealCount] = useState(0);
  const [playing, setPlaying] = useState(true);

  const frameRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const accumulatorRef = useRef(0);

  const done = revealCount >= result.events.length;

  const hud = useMemo(
    () => deriveHudState(result.events, revealCount, fighterA.id, fighterB.id),
    [result, revealCount],
  );
  const scorecardTotals = useMemo(
    () => runningScorecardTotals(result, hud.roundsScored),
    [result, hud.roundsScored],
  );
  const pillarsA = useMemo(() => computePillars(fighterA.attributes), []);
  const pillarsB = useMemo(() => computePillars(fighterB.attributes), []);

  useEffect(() => {
    if (!playing || done) return;

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
        setRevealCount((count) => Math.min(result.events.length, count + revealed));
      }
      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      lastTsRef.current = null;
    };
  }, [playing, done, result.events.length]);

  return (
    <div>
      <h1>Fight night</h1>
      <p>
        {fighterA.name} vs {fighterB.name}
      </p>

      <div style={{ padding: '0 3rem 1rem' }}>
        <StatRadar
          axes={[...PILLAR_AXES]}
          series={[
            { name: fighterA.name, color: '#4a9d5f', values: [pillarsA.striking, pillarsA.grappling, pillarsA.durability, pillarsA.mind] },
            { name: fighterB.name, color: '#d64545', values: [pillarsB.striking, pillarsB.grappling, pillarsB.durability, pillarsB.mind] },
          ]}
        />
      </div>

      <div style={{ display: 'flex', gap: '2rem' }}>
        <div style={{ flex: 1 }}>
          <strong>
            {fighterA.name}
            {hud.rockedA ? ' — HURT' : ''}
          </strong>
          <HudBar label="Health" value={hud.healthA} tone="health" />
          <HudBar label="Stamina" value={hud.staminaA} tone="stamina" />
        </div>
        <div style={{ flex: 1 }}>
          <strong>
            {fighterB.name}
            {hud.rockedB ? ' — HURT' : ''}
          </strong>
          <HudBar label="Health" value={hud.healthB} tone="health" />
          <HudBar label="Stamina" value={hud.staminaB} tone="stamina" />
        </div>
      </div>

      <div>
        <button type="button" onClick={() => setPlaying((p) => !p)} disabled={done}>
          {done ? 'Finished' : playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" onClick={() => setRevealCount(result.events.length)} disabled={done}>
          Skip to end
        </button>
      </div>

      <PlayByPlay
        events={result.events}
        revealCount={revealCount}
        fighterNames={{ [fighterA.id]: fighterA.name, [fighterB.id]: fighterB.name }}
      />

      {hud.roundsScored > 0 && (
        <table>
          <thead>
            <tr>
              <th>Judge</th>
              <th>{fighterA.name}</th>
              <th>{fighterB.name}</th>
            </tr>
          </thead>
          <tbody>
            {scorecardTotals.map((row) => {
              const judge = judges.find((j) => j.id === row.judgeId);
              return (
                <tr key={row.judgeId}>
                  <td>{judge?.name ?? row.judgeId}</td>
                  <td>{row.a}</td>
                  <td>{row.b}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {done && (
        <p>
          {winnerName(result)} wins by {result.method} (round {result.endRound})
        </p>
      )}
    </div>
  );
}
