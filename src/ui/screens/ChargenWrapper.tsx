// ChargenWrapper.tsx — Loop 4.3: the amateur wrapper (DESIGN.md §9.1). Six
// formative moments, fiction-only choices — this screen never renders a
// statDelta, a point total, or a running attribute number. Loop 4.4 adds
// the payoff: once the montage is done, RevealScreen takes over with the
// numbers the montage withheld, and only then does the player commit to a
// pro debut. Loop 6.5 adds step 0 ahead of the six moments — "who's in the
// mirror" — where the player authors their own FaceCode via PortraitEditor
// before the montage begins; that authored face is what flows into
// startCareer, replacing the seeded-but-unedited roll this screen used to make
// on its own.

import { useMemo, useState } from 'preact/hooks';
import type { MomentOption } from '../../state/schema';
import { amateurMoments } from '../../content';
import { buildOriginFromChoices } from '../../career/origin';
import { startCareer } from '../../career/progression';
import { mulberry32, seedFromString } from '../../engine';
import { Screen } from '../components/Screen';
import { PortraitEditor } from '../portrait/PortraitEditor';
import { useCageStore } from '../../state/store';
import { RevealScreen } from './RevealScreen';

export function ChargenWrapper() {
  const setCareer = useCageStore((s) => s.setCareer);
  const [face, setFace] = useState<string | null>(null);
  const [chosen, setChosen] = useState<MomentOption[]>([]);
  const faceRng = useMemo(() => mulberry32(seedFromString(`chargen-face-${Date.now()}`)), []);

  const momentIndex = chosen.length;
  const done = face !== null && momentIndex >= amateurMoments.length;
  const moment = face !== null && !done ? amateurMoments[momentIndex] : null;
  const origin = useMemo(() => (done ? buildOriginFromChoices(chosen) : null), [done, chosen]);

  function choose(option: MomentOption) {
    setChosen((prev) => [...prev, option]);
  }

  function beginProCareer() {
    if (!origin || !face) return;
    setCareer(startCareer(origin, 'player-1', 'Your Fighter', undefined, undefined, face));
    window.location.hash = '#/';
  }

  if (done && origin && face) {
    return <RevealScreen origin={origin} onBeginCareer={beginProCareer} />;
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
        <div>
          <p style={{ marginBottom: '0.75rem', color: 'var(--text-soft)' }}>
            Moment {momentIndex + 1} of {amateurMoments.length}
          </p>
          <p style={{ marginBottom: '1rem' }}>{moment.prompt}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {moment.options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => choose(option)}
                style={{ textAlign: 'left', padding: '0.6rem' }}
              >
                <strong>{option.label}</strong>
                <br />
                <span style={{ fontSize: 'var(--t-2)', color: 'var(--text-soft)' }}>{option.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Screen>
  );
}
