// PortraitEditor.tsx — Loop 6.5: "who's in the mirror," step 0 of the amateur
// wrapper (DESIGN.md §9.1/§15.4). Per-slot cyclers over the feature dictionary,
// a randomize control, and a confirm — no statline, exactly like every other
// wrapper step. The authored FaceCode is the only thing this component hands
// back; it never touches Origin, career state, or the RNG stream that seeds
// the skip path (that stays independent, per §9.3).
//
// The screen is a licence application with the photograph affixed to it: the
// portrait is the largest thing on the page, and the nine slots are the form
// beside it. Two things changed from the first build, both because the form was
// unreadable rather than because it was plain:
//
//   * a field's value is its NAME ("Buzz", "Hooded", "Boxed beard"), not a row
//     of ●●○○○ pips. Nine identical dot strings tell a player neither what they
//     have nor what they are cycling towards, and they read as a progress meter
//     for something — which is the one thing they are not.
//   * the two tone slots show the colour itself instead of a name. See
//     features.ts FEATURE_LABELS for why they are not named in words.

import { useState } from 'preact/hooks';
import type { RNG } from '../../engine';
import { faceFromSeed, serializeFaceCode, SLOT_COUNTS, SLOT_ORDER, type FaceCode } from './faceCode';
import { FEATURE_LABELS, HAIR_COLORS, SKIN_TONES } from './features';
import { Portrait } from './Portrait';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import styles from './PortraitEditor.module.css';

const SLOT_LABELS: Record<keyof FaceCode, string> = {
  skin: 'Skin tone',
  build: 'Build',
  head: 'Face shape',
  hair: 'Hair',
  hairColor: 'Hair colour',
  brow: 'Brow',
  eyes: 'Eyes',
  nose: 'Nose',
  mouth: 'Mouth',
  facialHair: 'Facial hair',
  marks: 'Marks',
  gear: 'Corner gear',
};

/** The two slots that select a colour rather than a shape, and the ramp each one
 *  cycles through. Both are still named in FEATURE_LABELS — this table only
 *  decides that the field SHOWS the colour instead of the name. */
const SWATCHES: Partial<Record<keyof FaceCode, readonly string[]>> = {
  skin: SKIN_TONES,
  hairColor: HAIR_COLORS,
};

function cycle(value: number, count: number, delta: number): number {
  return (value + delta + count) % count;
}

interface PortraitEditorProps {
  /** Seeds the initial face and the randomize control — same RNG the caller
   *  already owns, so a given playthrough starts from a stable-but-real face
   *  rather than the all-zero default. */
  rng: RNG;
  onConfirm: (face: string) => void;
}

export function PortraitEditor({ rng, onConfirm }: PortraitEditorProps) {
  const [code, setCode] = useState<FaceCode>(() => faceFromSeed(rng));

  function setSlot(slot: keyof FaceCode, delta: number) {
    setCode((prev) => ({ ...prev, [slot]: cycle(prev[slot], SLOT_COUNTS[slot], delta) }));
  }

  function randomize() {
    setCode(faceFromSeed(rng));
  }

  function confirm() {
    onConfirm(serializeFaceCode(code));
  }

  return (
    <Sheet title="Licence photograph">
      <p class={styles.hint}>
        Cycle each field, or take the whole face at random. This is who shows up on your licence —
        you can't change it once you're signed.
      </p>

      <div class={styles.layout}>
        <div class={styles.photo}>
          {/* No `size` prop: .photo sets --portrait-size to a clamp so the
              photograph scales with the viewport and stays square. */}
          <Portrait face={code} />
          <span class={styles.photoCaption}>Commission photograph</span>
          <Button type="button" block onClick={randomize}>
            Randomize
          </Button>
        </div>

        <div class={styles.fields}>
          {SLOT_ORDER.map((slot) => {
            const label = SLOT_LABELS[slot];
            const swatches = SWATCHES[slot];
            const name = FEATURE_LABELS[slot][code[slot]];

            return (
              <div key={slot} class={styles.field}>
                <span class={styles.fieldLabel} id={`face-${slot}`}>
                  {label}
                </span>
                <div class={styles.cycler} role="group" aria-labelledby={`face-${slot}`}>
                  <Button type="button" aria-label={`Previous ${label.toLowerCase()}`} onClick={() => setSlot(slot, -1)}>
                    &larr;
                  </Button>
                  {/* Polite rather than assertive: cycling a slot is a small, expected
                      change, and nine fields firing assertive updates would talk over
                      the player working through them. */}
                  <span class={styles.fieldValue} aria-live="polite">
                    {swatches ? (
                      <>
                        <span class={styles.swatch} style={`background:${swatches[code[slot]]}`} aria-hidden="true" />
                        <span class={styles.srOnly}>{name}</span>
                      </>
                    ) : (
                      name
                    )}
                  </span>
                  <Button type="button" aria-label={`Next ${label.toLowerCase()}`} onClick={() => setSlot(slot, 1)}>
                    &rarr;
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div class={styles.actions}>
        <Button type="button" variant="primary" block onClick={confirm}>
          Confirm face
        </Button>
      </div>
    </Sheet>
  );
}
