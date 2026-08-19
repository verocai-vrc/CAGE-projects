// ChargenWrapper.tsx — Loop 4.3: the amateur wrapper (DESIGN.md §9.1). Six
// formative moments, fiction-only choices — this screen never renders a
// statDelta, a point total, or a running attribute number. Loop 4.4 adds
// the payoff: once the montage is done, RevealScreen takes over with the
// numbers the montage withheld, and only then does the player commit to a
// pro debut. Loop 6.5 adds step 0 ahead of the six moments — "who's in the
// mirror" — where the player authors their own FaceCode via PortraitEditor
// before the montage begins; that authored face is what flows into
// startCareer, replacing the seeded-but-unedited roll this screen used to make
// on its own. Loop 6.7 rebuilds the moment-choice step on the component kit —
// each moment is a Sheet, each option a full-width ghost Button with the
// fiction as its subtitle. The "Moment N of M" caption is a step counter, not
// a statline, so it does not trip §9.1's no-numbers rule (DESIGN.md §9.1 —
// that rule is about live stat deltas, and §9.1 explicitly clears the
// portrait step on the same grounds).

import { useMemo, useState } from 'preact/hooks';
import type { MomentOption } from '../../state/schema';
import { amateurMoments } from '../../content';
import { buildOriginFromChoices } from '../../career/origin';
import { startCareer } from '../../career/progression';
import { originRng, rollCareerSeed } from '../../career/seed';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { Sheet } from '../components/Sheet';
import { PortraitEditor } from '../portrait/PortraitEditor';
import { useCageStore } from '../../state/store';
import { RevealScreen } from './RevealScreen';

export function ChargenWrapper() {
  const setCareer = useCageStore((s) => s.setCareer);
  const [face, setFace] = useState<string | null>(null);
  const [chosen, setChosen] = useState<MomentOption[]>([]);
  // Loop 7.1: chargen owns the career's seed, rolled once when the screen
  // mounts and carried through to startCareer — so the face the editor opens on
  // is part of the same reproducible run as everything after it, rather than a
  // `chargen-face-${Date.now()}` roll belonging to nothing (§16.2).
  const seed = useMemo(() => rollCareerSeed(), []);
  const faceRng = useMemo(() => originRng(seed), [seed]);

  const momentIndex = chosen.length;
  const done = face !== null && momentIndex >= amateurMoments.length;
  const moment = face !== null && !done ? amateurMoments[momentIndex] : null;
  const origin = useMemo(() => (done ? buildOriginFromChoices(chosen) : null), [done, chosen]);

  function choose(option: MomentOption) {
    setChosen((prev) => [...prev, option]);
  }

  function beginProCareer() {
    if (!origin || !face) return;
    setCareer(startCareer(origin, seed, 'player-1', 'Your Fighter', { face }));
    window.location.hash = '#/';
  }

  if (done && origin && face) {
    return <RevealScreen origin={origin} face={face} onBeginCareer={beginProCareer} />;
  }

  if (face === null) {
    return (
      <Screen register="file" id="chargen-wrapper" title="Who's in the mirror">
        <PortraitEditor rng={faceRng} onConfirm={setFace} />
      </Screen>
    );
  }

  return (
    <Screen register="file" id="chargen-wrapper" title="Where it all started">
      {moment && (
        <Sheet caption={`Moment ${momentIndex + 1} of ${amateurMoments.length}`}>
          <p style={{ marginBottom: 'var(--sp-4)' }}>{moment.prompt}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            {moment.options.map((option) => (
              <Button
                key={option.id}
                variant="ghost"
                block
                onClick={() => choose(option)}
                style={{ flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', height: 'auto', padding: 'var(--sp-3)' }}
              >
                <strong>{option.label}</strong>
                <span style={{ fontSize: 'var(--t-2)', color: 'var(--text-soft)', fontWeight: 400 }}>
                  {option.text}
                </span>
              </Button>
            ))}
          </div>
        </Sheet>
      )}
    </Screen>
  );
}
