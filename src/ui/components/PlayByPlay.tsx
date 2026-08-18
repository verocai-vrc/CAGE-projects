// PlayByPlay.tsx — renders a FightEvent[] log up to `revealCount`, in order.
// Keyed by stable index on a monotonically-growing slice, so Preact only
// ever appends new nodes as revealCount grows and never remounts previously
// revealed lines (DESIGN.md §2 memory rules: reuse DOM nodes, no
// mount/unmount storm).
//
// Loop 6.8 (§15.2): a line naming one fighter renders that name in a
// corner-tinted span (--corner-text via a wrapping .corner-red/.corner-blue)
// rather than plain text — "every play-by-play line inherits its corner
// colour." describeEvent returns a structured segment list instead of a flat
// string so the actor's name can carry its own span.

import { useEffect, useRef } from 'preact/hooks';
import type { FightEvent, MomentKind } from '../../engine/types';
import styles from './PlayByPlay.module.css';

const MOMENT_LABEL: Record<MomentKind, string> = {
  scramble: 'scramble',
  submissionEscape: 'submission escape',
  finishingSequence: 'finishing sequence',
};

// A line is plain text with at most one actor substring called out for
// corner tinting — never more than one, so a line never has to arbitrate
// between two fighters' colours in the same breath.
interface EventLine {
  before: string;
  actor?: { id: string; name: string };
  after: string;
}

function line(before: string, actor: { id: string; name: string } | undefined, after: string): EventLine {
  return { before, actor, after };
}

function describeEvent(event: FightEvent, name: (id: string) => string): EventLine {
  switch (event.t) {
    case 'strike':
      return line(`R${event.round} — `, { id: event.by, name: name(event.by) }, ` lands a ${event.kind} (${event.damage.toFixed(1)} dmg)`);
    case 'takedown':
      return line(`R${event.round} — `, { id: event.by, name: name(event.by) }, ` ${event.success ? 'lands' : 'fails'} a takedown`);
    case 'position':
      return line(`R${event.round} — position: ${event.state}`, undefined, '');
    case 'knockdown':
      return line(`R${event.round} — `, { id: event.who, name: name(event.who) }, ' is hurt!');
    case 'submissionAttempt':
      return line(
        `R${event.round} — `,
        { id: event.by, name: name(event.by) },
        ` hunts a submission — ${event.escaped ? 'defended' : 'locked in'}`,
      );
    case 'cornerCall':
      return line(`R${event.round} — corner calls for ${event.tacticId}`, undefined, '');
    case 'checkEnd':
      return line(`R${event.round} check ${event.check} — `, undefined, `${event.winner === 'even' ? 'even exchange' : `${event.winner} takes the minute`}`);
    case 'playerMoment': {
      const label = MOMENT_LABEL[event.kind];
      const verdict = event.outcome === 'success' ? 'won' : 'lost';
      // 'auto' marks a moment the engine resolved (skipped or auto-resolved);
      // 'played' marks one the player took by hand.
      return line(`R${event.round} — ${label} ${verdict} (${event.played ? 'played' : 'auto'})`, undefined, '');
    }
    case 'roundEnd':
      return line(`— End of round ${event.round} (${event.scoreA}-${event.scoreB} strikes) —`, undefined, '');
    case 'finish':
      return line('', { id: event.who, name: name(event.who) }, ` wins by ${event.method}! (R${event.round})`);
  }
}

interface PlayByPlayProps {
  events: FightEvent[];
  revealCount: number;
  fighterNames: Record<string, string>;
  /** Which corner each fighter id belongs to, for actor-name tinting. */
  cornerOf: Record<string, 'red' | 'blue'>;
}

export function PlayByPlay({ events, revealCount, fighterNames, cornerOf }: PlayByPlayProps) {
  const name = (id: string) => fighterNames[id] ?? id;
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [revealCount]);

  const visible = events.slice(0, revealCount);

  return (
    <div ref={containerRef} class={styles.root}>
      {visible.map((event, i) => {
        const { before, actor, after } = describeEvent(event, name);
        return (
          <div key={i} class={styles.line}>
            {before}
            {actor && (
              <span class={`${styles.actor} corner-${cornerOf[actor.id] ?? 'red'}`}>{actor.name}</span>
            )}
            {after}
          </div>
        );
      })}
    </div>
  );
}
