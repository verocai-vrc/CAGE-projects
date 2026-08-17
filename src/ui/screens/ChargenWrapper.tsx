// ChargenWrapper.tsx — Loop 4.3: the amateur wrapper (DESIGN.md §9.1). Six
// formative moments, fiction-only choices — this screen never renders a
// statDelta, a point total, or a running attribute number. Loop 4.4 adds
// the payoff: once the montage is done, RevealScreen takes over with the
// numbers the montage withheld, and only then does the player commit to a
// pro debut.

import { useMemo, useState } from 'preact/hooks';
import type { MomentOption } from '../../state/schema';
import { amateurMoments } from '../../content';
import { buildOriginFromChoices } from '../../career/origin';
import { startCareer } from '../../career/progression';
import { mulberry32, seedFromString } from '../../engine';
import { Screen } from '../components/Screen';
import { faceFromSeed, serializeFaceCode } from '../portrait/faceCode';
import { useCageStore } from '../../state/store';
import { RevealScreen } from './RevealScreen';

export function ChargenWrapper() {
  const setCareer = useCageStore((s) => s.setCareer);
  const [chosen, setChosen] = useState<MomentOption[]>([]);

  const momentIndex = chosen.length;
  const done = momentIndex >= amateurMoments.length;
  const moment = done ? null : amateurMoments[momentIndex];
  const origin = useMemo(() => (done ? buildOriginFromChoices(chosen) : null), [done, chosen]);

  function choose(option: MomentOption) {
    setChosen((prev) => [...prev, option]);
  }

  function beginProCareer() {
    if (!origin) return;
    // Loop 6.5 adds step 0 ("who's in the mirror") — a real portrait editor whose
    // authored FaceCode flows in here instead of this roll. Until then the full
    // wrapper path gets a real, varied face rather than the all-zero default, seeded
    // off the six moment choices so it's at least stable for a given playthrough.
    const rng = mulberry32(seedFromString(chosen.map((c) => c.id).join('-')));
    const face = serializeFaceCode(faceFromSeed(rng));
    setCareer(startCareer(origin, 'player-1', 'Your Fighter', undefined, undefined, face));
    window.location.hash = '#/';
  }

  if (done && origin) {
    return <RevealScreen origin={origin} onBeginCareer={beginProCareer} />;
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
