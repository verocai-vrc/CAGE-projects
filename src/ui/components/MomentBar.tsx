// MomentBar.tsx — Loop 2.4: the player-moment mechanics (DESIGN.md §7).
//
// Two mechanics, assigned per MomentKind so each moment plays the way its
// fiction reads (see MECHANIC below):
//   - timing bar  — a marker sweeps a track; stop it inside the target zone.
//                   Reactive, for moments that are a single committed instant.
//   - risk ladder — push-your-luck: climb for a better result, bank to keep
//                   what you have. Deliberate, for moments you can ride out.
//
// How both stay engine-authoritative
// ----------------------------------
// simulateFight has already ROLLED this moment, and it rolls again on every
// re-simulation — the sim always owns the probability (§7). Neither mechanic
// returns an outcome. Both return a PERFORMANCE in -1..+1, which the engine
// converts into a bounded tilt on the moment's contested delta (at most
// balance.momentSkillSwing). So:
//
//   - Playing well genuinely improves the odds — skill is real, not cosmetic.
//   - Playing well cannot manufacture a win from a hopeless exchange, and
//     playing badly cannot throw away a dominant one. Matchup still rules.
//   - Performance 0 is exactly what the engine rolls unaided, so the
//     auto-resolve / skip path is never worse than a neutral attempt: the
//     game stays fully completable with zero twitch input.
//
// Loop 6.8: rebuilt on Plate/Button, always the red corner (see the module
// CSS header for why), all styling moved out of inline styles.

import { useEffect, useRef, useState } from 'preact/hooks';
import { Plate } from './Plate';
import { Button } from './Button';
import type { MomentKind, MomentPerformance } from '../../engine/types';
import styles from './MomentBar.module.css';

type Mechanic = 'timing' | 'ladder';

// Which mechanic each kind uses. A scramble and a finishing sequence are
// single explosive instants (timing); a submission escape is something you
// grind through and can choose to stop fighting (ladder).
const MECHANIC: Record<MomentKind, Mechanic> = {
  scramble: 'timing',
  finishingSequence: 'timing',
  submissionEscape: 'ladder',
};

interface MomentCopy {
  title: string;
  prompt: string;
  climb: string;
  bank: string;
}

const COPY: Record<MomentKind, MomentCopy> = {
  scramble: {
    title: 'Scramble',
    prompt: 'Bodies tangled — time your burst for the position.',
    climb: 'Keep scrambling',
    bank: 'Settle for position',
  },
  submissionEscape: {
    title: 'Submission escape',
    prompt: 'The choke is tightening. Work the grip, or ride it out?',
    climb: 'Fight the hands',
    bank: 'Defend and survive',
  },
  finishingSequence: {
    title: 'Finishing sequence',
    prompt: "They're hurt — pick your shot.",
    climb: 'Swing for the finish',
    bank: 'Stay composed',
  },
};

interface MomentBarProps {
  kind: MomentKind;
  onResolve: (performance: MomentPerformance, played: boolean) => void;
}

export function MomentBar({ kind, onResolve }: MomentBarProps) {
  const copy = COPY[kind];
  const mechanic = MECHANIC[kind];

  return (
    <div class="corner-red">
      <Plate eyebrow="Moment" title={copy.title} corner>
        <p class={styles.prompt}>{copy.prompt}</p>
        {mechanic === 'timing' ? (
          <TimingBar copy={copy} onResolve={onResolve} />
        ) : (
          <RiskLadder copy={copy} onResolve={onResolve} />
        )}
      </Plate>
    </div>
  );
}

// --- Timing bar -------------------------------------------------------------
//
// A marker sweeps back and forth; stopping it inside the centre zone scores
// well. Performance falls off smoothly with distance from centre, so this is
// a graded read rather than a binary hit/miss.

const SWEEP_MS = 1400; // one full there-and-back cycle
const TARGET_HALF_WIDTH = 0.18; // zone spans centre +/- this, as a fraction

interface MechanicProps {
  copy: MomentCopy;
  onResolve: (performance: MomentPerformance, played: boolean) => void;
}

function TimingBar({ copy, onResolve }: MechanicProps) {
  // 0..1 position across the track.
  const [pos, setPos] = useState(0);
  const [locked, setLocked] = useState<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (locked !== null) return;

    function tick(ts: number) {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = (ts - startRef.current) % SWEEP_MS;
      // Triangle wave: 0 -> 1 -> 0.
      const phase = elapsed / SWEEP_MS;
      setPos(phase < 0.5 ? phase * 2 : 2 - phase * 2);
      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      startRef.current = null;
    };
  }, [locked]);

  function stop() {
    setLocked(pos);
    // Distance from centre, normalised so dead-centre = +1 and either edge
    // = -1. The target zone is the band where performance stays positive.
    const performance = 1 - Math.abs(pos - 0.5) / 0.5 * 2;
    onResolve(Math.max(-1, Math.min(1, performance)), true);
  }

  const shown = locked ?? pos;

  return (
    <>
      <div class={styles.track}>
        <div
          class={styles.targetZone}
          style={{ left: `${(0.5 - TARGET_HALF_WIDTH) * 100}%`, width: `${TARGET_HALF_WIDTH * 2 * 100}%` }}
        />
        <div
          class={`${styles.marker} ${locked !== null ? styles.locked : ''}`}
          style={{ left: `${shown * 100}%` }}
        />
      </div>

      {locked === null && (
        <div class={styles.actions}>
          <Button variant="primary" onClick={stop}>
            {copy.climb}
          </Button>
          {/* §7: fair to skip — a neutral performance is exactly the engine's
              own unaided roll, so skipping costs nothing. */}
          <Button variant="ghost" onClick={() => onResolve(0, false)}>
            Auto-resolve
          </Button>
        </div>
      )}
    </>
  );
}

// --- Risk ladder ------------------------------------------------------------
//
// Each rung climbed raises performance, but the bust chance rises with it.
// Busting bottoms performance out; banking keeps what has been earned. The
// gamble is real because the engine's roll is still what decides the moment —
// the ladder only sets how much help (or harm) the player brings to it.

const RUNGS = 4;
// Performance awarded for banking at each rung index (0 = bank immediately).
const RUNG_PERFORMANCE = [0, 0.35, 0.7, 1];
// Chance the next climb busts, per rung about to be attempted.
const BUST_CHANCE = [0, 0.15, 0.35, 0.55];

function RiskLadder({ copy, onResolve }: MechanicProps) {
  const [rung, setRung] = useState(0);
  const [busted, setBusted] = useState(false);

  function climb() {
    // The ladder's own gamble is UI-local: it decides how well the player
    // performed, never whether the moment was won. Math.random is fine here
    // (this is /ui, not /engine) — the engine roll that actually resolves the
    // moment stays seeded and deterministic.
    if (Math.random() < BUST_CHANCE[rung]) {
      setBusted(true);
      onResolve(-1, true); // pushed too far and got caught
      return;
    }
    const next = rung + 1;
    setRung(next);
    if (next >= RUNGS - 1) onResolve(RUNG_PERFORMANCE[RUNGS - 1], true); // topped out
  }

  function bank() {
    onResolve(RUNG_PERFORMANCE[rung], true);
  }

  const done = busted || rung >= RUNGS - 1;

  return (
    <>
      <div class={styles.rungs}>
        {Array.from({ length: RUNGS }, (_, i) => {
          const classes = [
            styles.rung,
            BUST_CHANCE[i] >= 0.35 ? styles.risky : '',
            busted ? styles.busted : i < rung ? styles.climbed : '',
          ]
            .filter(Boolean)
            .join(' ');
          return <div key={i} class={classes} />;
        })}
      </div>

      {busted && <p class={`${styles.outcome} ${styles.bad}`}>Caught pushing — it slipped away.</p>}
      {!busted && rung >= RUNGS - 1 && <p class={`${styles.outcome} ${styles.good}`}>Perfect execution.</p>}

      {!done && (
        <div class={styles.actions}>
          <Button variant="primary" onClick={climb}>
            {copy.climb} ({Math.round(BUST_CHANCE[rung] * 100)}% risk)
          </Button>
          <Button variant="ghost" onClick={bank}>
            {copy.bank}
          </Button>
          <Button variant="ghost" onClick={() => onResolve(0, false)}>
            Auto-resolve
          </Button>
        </div>
      )}
    </>
  );
}
