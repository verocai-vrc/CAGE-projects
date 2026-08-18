// Walkout.tsx — Loop 6.10: the one choreographed set piece (DESIGN.md
// §15.7), the six-beat sequence at the File->Broadcast register boundary:
//   1. the file curls away, tunnel plate behind it
//   2. red corner enters from the left
//   3. blue corner enters from the right
//   4. VS strikes through the center
//   5. tale of the tape ticks in row by row
//   6. bell — the HUD takes over
// ~2.5s total, CSS transforms/opacity only (Walkout.module.css). This
// component only sequences WHICH beat's markup is revealed — a setTimeout
// chain flips boolean data attributes on .root; every actual animation is a
// CSS transition/keyframe reacting to that attribute, per the loop's own
// "CSS only" framing.
//
// Skippable by any input, and reduced-motion means it never plays at all
// (not "plays instantly") — DESIGN.md §15.7 wants a cut to the end state,
// and index.css's global @media rule alone would only collapse durations to
// ~0, which still mounts/unmounts every beat's markup. So this is the
// codebase's first JS-side prefers-reduced-motion check.

import { useEffect, useRef, useState } from 'preact/hooks';
import { FighterIdentity } from './FighterIdentity';
import { ScenePlate } from './ScenePlate';
import { TaleOfTheTape } from './TaleOfTheTape';
import type { Fighter } from '../../engine/types';
import type { Pillars } from '../../engine/round';
import styles from './Walkout.module.css';

// Cumulative ms from mount at which each beat's reveal attribute flips.
// Order matches DESIGN.md §15.7's six-beat list; beat 1 (file curls away)
// is the resting state at t=0, so it has no entry of its own here.
const BEAT_TIMING = {
  fileGone: 500, // beat 1 exits
  redIn: 550, // beat 2
  blueIn: 950, // beat 3
  vsIn: 1400, // beat 4
  tapeIn: 1700, // beat 5
  exit: 2300, // beat 6: bell — start the fade
  done: 2500, // overlay fully gone, HUD takes over
} as const;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface WalkoutProps {
  fighterA: Fighter;
  fighterB: Fighter;
  pillarsA: Pillars;
  pillarsB: Pillars;
  onDone: () => void;
}

export function Walkout({ fighterA, fighterB, pillarsA, pillarsB, onDone }: WalkoutProps) {
  const [beats, setBeats] = useState({
    fileGone: false,
    redIn: false,
    blueIn: false,
    vsIn: false,
    tapeIn: false,
    exiting: false,
  });
  const timers = useRef<number[]>([]);
  const finished = useRef(false);

  function finish() {
    if (finished.current) return;
    finished.current = true;
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
    onDone();
  }

  useEffect(() => {
    // Reduced motion: never mount a single timer, never show a single beat —
    // the caller already skips straight to the HUD (see FightScreen.tsx).
    if (prefersReducedMotion()) {
      finish();
      return;
    }

    timers.current = [
      window.setTimeout(() => setBeats((b) => ({ ...b, fileGone: true })), BEAT_TIMING.fileGone),
      window.setTimeout(() => setBeats((b) => ({ ...b, redIn: true })), BEAT_TIMING.redIn),
      window.setTimeout(() => setBeats((b) => ({ ...b, blueIn: true })), BEAT_TIMING.blueIn),
      window.setTimeout(() => setBeats((b) => ({ ...b, vsIn: true })), BEAT_TIMING.vsIn),
      window.setTimeout(() => setBeats((b) => ({ ...b, tapeIn: true })), BEAT_TIMING.tapeIn),
      window.setTimeout(() => setBeats((b) => ({ ...b, exiting: true })), BEAT_TIMING.exit),
      window.setTimeout(finish, BEAT_TIMING.done),
    ];

    // Skippable by any input — one listener, removed with the rest of the
    // sequence's timers on finish/unmount.
    function onSkip() {
      setBeats((b) => ({ ...b, exiting: true }));
      finish();
    }
    window.addEventListener('keydown', onSkip);
    window.addEventListener('pointerdown', onSkip);

    return () => {
      for (const id of timers.current) window.clearTimeout(id);
      window.removeEventListener('keydown', onSkip);
      window.removeEventListener('pointerdown', onSkip);
    };
    // Runs exactly once per mount — the "once per fight" contract (§15.7) —
    // so this intentionally never re-subscribes on prop changes.
  }, []);

  if (prefersReducedMotion()) return null;

  return (
    <div
      class={`${styles.root} ${beats.exiting ? styles.exiting : ''}`}
      data-file-gone={beats.fileGone || undefined}
      data-red-in={beats.redIn || undefined}
      data-blue-in={beats.blueIn || undefined}
      data-vs-in={beats.vsIn || undefined}
      data-tape-in={beats.tapeIn || undefined}
      aria-hidden="true"
    >
      <div class={styles.tunnel}>
        <ScenePlate plate="tunnel" />
      </div>
      <div class={styles.filePanel} />

      <div class={styles.corners}>
        <div class={`${styles.cornerBlock} ${styles.left}`}>
          <FighterIdentity fighter={fighterA} corner="red" />
        </div>
        <div class={`${styles.cornerBlock} ${styles.right}`}>
          <FighterIdentity fighter={fighterB} corner="blue" />
        </div>
      </div>

      <div class={styles.vsGlyph}>VS</div>

      <div class={styles.tape}>
        <TaleOfTheTape fighterA={fighterA} fighterB={fighterB} pillarsA={pillarsA} pillarsB={pillarsB} animated />
      </div>
    </div>
  );
}
