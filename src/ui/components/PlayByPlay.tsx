// PlayByPlay.tsx — renders a FightEvent[] log up to `revealCount`, in order.
// Keyed by stable index on a monotonically-growing slice, so Preact only
// ever appends new nodes as revealCount grows and never remounts previously
// revealed lines (DESIGN.md §2 memory rules: reuse DOM nodes, no
// mount/unmount storm).

import { useEffect, useRef } from 'preact/hooks';
import type { FightEvent, MomentKind } from '../../engine/types';

const MOMENT_LABEL: Record<MomentKind, string> = {
  scramble: 'scramble',
  submissionEscape: 'submission escape',
  finishingSequence: 'finishing sequence',
};

function describeEvent(event: FightEvent, name: (id: string) => string): string {
  switch (event.t) {
    case 'strike':
      return `R${event.round} — ${name(event.by)} lands a ${event.kind} (${event.damage.toFixed(1)} dmg)`;
    case 'takedown':
      return `R${event.round} — ${name(event.by)} ${event.success ? 'lands' : 'fails'} a takedown`;
    case 'position':
      return `R${event.round} — position: ${event.state}`;
    case 'knockdown':
      return `R${event.round} — ${name(event.who)} is hurt!`;
    case 'submissionAttempt':
      return `R${event.round} — ${name(event.by)} hunts a submission — ${event.escaped ? 'defended' : 'locked in'}`;
    case 'cornerCall':
      return `R${event.round} — corner calls for ${event.tacticId}`;
    case 'playerMoment': {
      const label = MOMENT_LABEL[event.kind];
      const verdict = event.outcome === 'success' ? 'won' : 'lost';
      // 'auto' marks a moment the engine resolved (skipped or auto-resolved);
      // 'played' marks one the player took by hand.
      return `R${event.round} — ${label} ${verdict} (${event.played ? 'played' : 'auto'})`;
    }
    case 'roundEnd':
      return `— End of round ${event.round} (${event.scoreA}-${event.scoreB} strikes) —`;
    case 'finish':
      return `R${event.round} — ${name(event.who)} wins by ${event.method}!`;
  }
}

interface PlayByPlayProps {
  events: FightEvent[];
  revealCount: number;
  fighterNames: Record<string, string>;
}

export function PlayByPlay({ events, revealCount, fighterNames }: PlayByPlayProps) {
  const name = (id: string) => fighterNames[id] ?? id;
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [revealCount]);

  const visible = events.slice(0, revealCount);

  return (
    <div
      ref={containerRef}
      style={{ maxHeight: '20rem', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.9rem' }}
    >
      {visible.map((event, i) => (
        <div key={i}>{describeEvent(event, name)}</div>
      ))}
    </div>
  );
}
