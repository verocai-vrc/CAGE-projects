// FightScreen.tsx — Loop 2.1: replays a FightResult.events[] log at a
// controllable pace (DESIGN.md §6.7, §7). The fixture fighters + seed here
// match the Loop 1.7 determinism test (tests/fight.spec.ts) — a known-good,
// provably deterministic FightResult — since the career layer that will
// supply a real matchup doesn't exist until M3.

import { useEffect, useRef, useState } from 'preact/hooks';
import { simulateFight } from '../../engine/fight';
import { mulberry32 } from '../../engine/rng';
import type { Fighter, FightResult, Tactics } from '../../engine/types';
import { archetypes } from '../../content';
import { PlayByPlay } from '../components/PlayByPlay';

const REVEAL_INTERVAL_MS = 220;
const FIXTURE_SEED = 2026;

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

export function FightScreen() {
  const [result] = useState<FightResult>(buildFixtureResult);
  const [revealCount, setRevealCount] = useState(0);
  const [playing, setPlaying] = useState(true);

  const frameRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const accumulatorRef = useRef(0);

  const done = revealCount >= result.events.length;

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

      {done && (
        <p>
          {winnerName(result)} wins by {result.method} (round {result.endRound})
        </p>
      )}
    </div>
  );
}
